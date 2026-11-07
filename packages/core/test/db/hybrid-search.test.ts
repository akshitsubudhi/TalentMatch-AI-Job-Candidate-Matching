import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { PgIngestionRepository } from "../../src/db";
import { HashingEmbedder } from "../../src/embeddings";
import { IngestionService } from "../../src/ingest";
import { rrfFuse } from "../../src/search/rrf";
import { JobCreateInputSchema, type Seniority } from "../../src/schemas";
import { createTestDatabase, TEST_DATABASE_URL } from "./helpers";

const enabled = Boolean(TEST_DATABASE_URL);

interface CandidateMatchRow {
  candidate_id: string;
  location: string;
  seniority: string;
  keyword_rank: number | null;
  semantic_rank: number | null;
  rrf_score: number;
}

describe.skipIf(!enabled)("Postgres: migrations, ingestion and hybrid search RPCs", () => {
  let pool: pg.Pool;
  let drop: () => Promise<void>;
  let service: IngestionService;
  let jobId: string;
  const candidateIds: string[] = [];

  beforeAll(async () => {
    ({ pool, drop } = await createTestDatabase());
    service = new IngestionService({
      repository: new PgIngestionRepository(pool),
      embedder: new HashingEmbedder(),
      extractText: async (b) => new TextDecoder().decode(b),
      chunkOptions: { maxTokens: 64, overlapTokens: 8 },
    });
    const job = await service.ingestJob(
      JobCreateInputSchema.parse({
        title: "Senior Data Engineer",
        description: "Own batch and streaming data pipelines with Airflow, Spark and Kafka on AWS.",
        location: "Berlin",
        seniority: "senior",
        skills: ["Airflow", "Apache Spark", "Kafka", "Python"],
      }),
    );
    jobId = job.id;

    const profiles: [string, string, Seniority, string][] = [
      ["Berlin", "Data engineer", "senior", "Built Airflow DAGs and Spark jobs in Python. Streaming with Kafka on AWS."],
      ["Berlin", "Data engineer", "mid", "Python ETL with Airflow. Some Spark."],
      ["Remote", "Data engineer", "senior", "Kafka streaming, Spark batch processing, Airflow orchestration in Python."],
      ["Berlin", "Frontend developer", "senior", "React and TypeScript single-page apps with accessible UI components."],
      ["Remote", "Designer", "junior", "Figma prototypes, user research and design systems for onboarding flows."],
      ["Berlin", "ML engineer", "senior", "PyTorch models; feature pipelines in Spark and Python; served on Kubernetes."],
    ];
    for (const [i, [location, headline, seniority, body]] of profiles.entries()) {
      const text = `${body} ${"Additional project work and collaboration with product teams. ".repeat(8)} Ref ${i}.`;
      const out = await service.ingestResume({
        bytes: new TextEncoder().encode(text),
        mime: "text/plain",
        filename: `${i}.txt`,
        fields: { fullName: `Synthetic ${i}`, location, seniority, headline, skills: [] },
      });
      candidateIds.push(out.id);
    }
  }, 60_000);

  afterAll(async () => {
    await drop?.();
  });

  it("is idempotent on re-upload and stores multiple chunks for long resumes", async () => {
    const text = `Built Airflow DAGs and Spark jobs in Python. Streaming with Kafka on AWS. ${"Additional project work and collaboration with product teams. ".repeat(8)} Ref 0.`;
    const again = await service.ingestResume({
      bytes: new TextEncoder().encode(text),
      mime: "text/plain",
      filename: "dupe.txt",
      fields: { fullName: "Dupe", location: "Berlin", seniority: "senior", headline: "Data engineer", skills: [] },
    });
    expect(again).toEqual({ id: candidateIds[0], duplicate: true });
    const { rows } = await pool.query<{ n: string }>("select count(*) as n from candidates");
    expect(Number(rows[0]!.n)).toBe(6);
    const chunks = await pool.query<{ n: string }>("select count(*) as n from candidate_chunks where candidate_id = $1", [
      candidateIds[0],
    ]);
    expect(Number(chunks.rows[0]!.n)).toBeGreaterThan(1);
  });

  it("concurrent uploads of the same file create exactly one candidate", async () => {
    const bytes = new TextEncoder().encode(`Concurrent upload test resume with Python and Airflow experience. ${"x ".repeat(40)}`);
    const fields = { fullName: "Race", location: "Remote", seniority: "mid" as const, headline: "", skills: [] };
    const results = await Promise.all(
      Array.from({ length: 5 }, () => service.ingestResume({ bytes, mime: "text/plain", filename: null, fields })),
    );
    expect(new Set(results.map((r) => r.id)).size).toBe(1);
    expect(results.filter((r) => !r.duplicate)).toHaveLength(1);
    await pool.query("delete from candidates where id = $1", [results[0]!.id]);
  });

  it("ranks relevant candidates first in hybrid mode", async () => {
    const { rows } = await pool.query<CandidateMatchRow>("select * from match_candidates_for_job($1, 6)", [jobId]);
    expect(rows.length).toBeGreaterThan(0);
    const top3 = rows.slice(0, 3).map((r) => r.candidate_id);
    expect(top3).toEqual(expect.arrayContaining([candidateIds[0], candidateIds[2]]));
    expect(rows.map((r) => r.candidate_id).indexOf(candidateIds[4]!)).not.toBe(0);
  });

  it("SQL fusion equals the TypeScript RRF reference implementation", async () => {
    const weights = { kw: 0.7, sem: 1.3, k: 20 };
    const { rows } = await pool.query<CandidateMatchRow>(
      "select * from match_candidates_for_job($1, 20, null, null, $2, $3, $4)",
      [jobId, weights.kw, weights.sem, weights.k],
    );
    const byRank = (key: "keyword_rank" | "semantic_rank") =>
      rows.filter((r) => r[key] !== null).sort((a, b) => a[key]! - b[key]!).map((r) => r.candidate_id);
    const expected = rrfFuse(
      [
        { name: "keyword", weight: weights.kw, ids: byRank("keyword_rank") },
        { name: "semantic", weight: weights.sem, ids: byRank("semantic_rank") },
      ],
      weights.k,
    );
    expect(rows.map((r) => r.candidate_id)).toEqual(expected.map((e) => e.id));
    rows.forEach((r, i) => expect(r.rrf_score).toBeCloseTo(expected[i]!.score, 12));
  });

  it("applies filters before ranking (ranks are contiguous within the filtered set)", async () => {
    const { rows } = await pool.query<CandidateMatchRow>(
      "select * from match_candidates_for_job($1, 10, 'Berlin', 'senior')",
      [jobId],
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect([r.location, r.seniority]).toEqual(["Berlin", "senior"]);
    const semRanks = rows.map((r) => r.semantic_rank).filter((x): x is number => x !== null).sort((a, b) => a - b);
    expect(semRanks).toEqual(semRanks.map((_, i) => i + 1));
  });

  it("weight 0 disables a retriever", async () => {
    const kwOnly = await pool.query<CandidateMatchRow>("select * from match_candidates_for_job($1, 10, null, null, 1, 0)", [jobId]);
    expect(kwOnly.rows.every((r) => r.semantic_rank === null && r.keyword_rank !== null)).toBe(true);
    const semOnly = await pool.query<CandidateMatchRow>("select * from match_candidates_for_job($1, 10, null, null, 0, 1)", [jobId]);
    expect(semOnly.rows.every((r) => r.keyword_rank === null && r.semantic_rank !== null)).toBe(true);
    expect(semOnly.rows).toHaveLength(6);
  });

  it("returns ranked jobs for a candidate", async () => {
    const { rows } = await pool.query<{ job_id: string; rrf_score: number }>("select * from match_jobs_for_candidate($1, 5)", [
      candidateIds[0],
    ]);
    expect(rows[0]?.job_id).toBe(jobId);
  });

  it("validates RPC arguments and unknown ids", async () => {
    await expect(pool.query("select * from match_candidates_for_job($1, 0)", [jobId])).rejects.toThrow(/p_match_count/);
    await expect(pool.query("select * from match_candidates_for_job($1, 5, null, null, 0, 0)", [jobId])).rejects.toThrow(/weight/);
    await expect(
      pool.query("select * from match_candidates_for_job('00000000-0000-0000-0000-000000000000', 5)"),
    ).rejects.toThrow(/job not found/);
  });

  it("enforces RLS: anon can read jobs but not resumes, and cannot run matching", async () => {
    const client = await pool.connect();
    try {
      await client.query("begin; set local role anon");
      const jobs = await client.query("select count(*) from jobs");
      expect(Number(jobs.rows[0].count)).toBeGreaterThan(0);
      await expect(client.query("select count(*) from candidates")).rejects.toThrow(/permission denied/);
      await client.query("rollback; begin; set local role anon");
      await expect(client.query("select * from match_candidates_for_job($1, 5)", [jobId])).rejects.toThrow(/permission denied/);
      await client.query("rollback; begin; set local role anon");
      await expect(client.query("insert into jobs (title) values ('x')")).rejects.toThrow(/permission denied/);
      await client.query("rollback; begin; set local role service_role");
      const cands = await client.query("select count(*) from candidates");
      expect(Number(cands.rows[0].count)).toBe(6);
    } finally {
      await client.query("rollback");
      client.release();
    }
  });

  it("uses the HNSW index for the ANN query when sequential scans are discouraged", async () => {
    const client = await pool.connect();
    try {
      await client.query("begin; set local enable_seqscan = off");
      const vec = (await client.query<{ e: string }>("select embedding::text as e from jobs where id = $1", [jobId])).rows[0]!.e;
      const plan = await client.query(
        "explain select candidate_id from candidate_chunks order by embedding <=> $1::extensions.vector limit 10",
        [vec],
      );
      const text = plan.rows.map((r: Record<string, string>) => r["QUERY PLAN"]).join("\n");
      expect(text).toContain("candidate_chunks_embedding_hnsw_idx");
    } finally {
      await client.query("rollback");
      client.release();
    }
  });

  it("maintains updated_at on update", async () => {
    const before = (await pool.query("select updated_at from jobs where id = $1", [jobId])).rows[0].updated_at as Date;
    await new Promise((r) => setTimeout(r, 20));
    const after = (await pool.query("update jobs set location = location where id = $1 returning updated_at", [jobId])).rows[0]
      .updated_at as Date;
    expect(after.getTime()).toBeGreaterThan(before.getTime());
  });
});
