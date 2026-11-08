/**
 * Measures the hybrid-search RPC on the seeded data and writes BENCHMARK.md
 * (+ benchmark-results.json). Nothing in the report is hand-entered.
 *
 *   pnpm benchmark                 # seed-scale run against DATABASE_URL (must be seeded)
 *   pnpm benchmark --scale=20000   # + latency at scale in a throwaway database on the
 *                                  #   same server (needs CREATE DATABASE; local/CI only)
 *   --reps=3 --scale-reps=1        # repetitions per job for latency sampling
 *
 * Quality: Recall@10 and MRR over the labelled set from buildLabelledSet() (ground truth
 * from the generator, see packages/core/src/seed/labels.ts), for keyword-only,
 * vector-only and hybrid (RRF) modes of the same RPC.
 * Latency: wall-clock time of `select * from match_candidates_for_job(...)` measured
 * by the client over a local connection; HNSW "off" = index dropped inside a
 * transaction that is rolled back.
 */
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import type pg from "pg";
import { mean, percentile, reciprocalRank, recallAtK } from "@talentmatch/core";
import { applyMigrations, createPool, PgIngestionRepository } from "@talentmatch/core/db";
import { createEmbedder } from "@talentmatch/core/embeddings";
import { IngestionService, sha256Hex } from "@talentmatch/core/ingest";
import { buildLabelledSet, createRng, generateDataset, type SeedDataset } from "@talentmatch/core/seed";
import { loadDotEnv, option, repoRoot } from "./env";

loadDotEnv();

const SEED = Number(option("seed") ?? 42);
const REPS = Number(option("reps") ?? 3);
const SCALE = Number(option("scale") ?? 0);
const SCALE_REPS = Number(option("scale-reps") ?? 1);
const WARMUP = 20;
const K = 10;
const HNSW_INDEX = "candidate_chunks_embedding_hnsw_idx";

interface Mode {
  name: string;
  keywordWeight: number;
  semanticWeight: number;
  rrfK: number;
}
const MODES: Mode[] = [
  { name: "keyword-only", keywordWeight: 1, semanticWeight: 0, rrfK: 60 },
  { name: "vector-only", keywordWeight: 0, semanticWeight: 1, rrfK: 60 },
  { name: "hybrid (RRF, w=1/1, k=60)", keywordWeight: 1, semanticWeight: 1, rrfK: 60 },
];
const SWEEP: Mode[] = [
  { name: "hybrid w_kw=1 w_sem=2 k=60", keywordWeight: 1, semanticWeight: 2, rrfK: 60 },
  { name: "hybrid w_kw=2 w_sem=1 k=60", keywordWeight: 2, semanticWeight: 1, rrfK: 60 },
  { name: "hybrid w_kw=1 w_sem=1 k=10", keywordWeight: 1, semanticWeight: 1, rrfK: 10 },
];

const RPC = "select candidate_id from public.match_candidates_for_job($1, $2, null, null, $3, $4, $5, 100)";

async function search(client: pg.PoolClient, jobId: string, mode: Mode, limit = K): Promise<string[]> {
  const { rows } = await client.query<{ candidate_id: string }>(RPC, [jobId, limit, mode.keywordWeight, mode.semanticWeight, mode.rrfK]);
  return rows.map((r) => r.candidate_id);
}

interface LatencyRow {
  scale: string;
  hnsw: "on" | "off";
  mode: string;
  samples: number;
  p50: number;
  p95: number;
  mean: number;
}

async function measureLatency(
  client: pg.PoolClient,
  jobIds: string[],
  mode: Mode,
  reps: number,
  meta: { scale: string; hnsw: "on" | "off" },
): Promise<LatencyRow> {
  for (let i = 0; i < WARMUP; i++) await search(client, jobIds[i % jobIds.length] as string, mode);
  const samples: number[] = [];
  for (let r = 0; r < reps; r++) {
    for (const id of jobIds) {
      const t0 = performance.now();
      await search(client, id, mode);
      samples.push(performance.now() - t0);
    }
  }
  return {
    ...meta,
    mode: mode.name,
    samples: samples.length,
    p50: percentile(samples, 50),
    p95: percentile(samples, 95),
    mean: mean(samples),
  };
}

/** Planner's choice for the ANN step, mirroring the RPC's semantic CTE. */
async function annPlan(client: pg.PoolClient, jobId: string): Promise<string> {
  const vec = (await client.query<{ e: string }>("select embedding::text as e from public.jobs where id = $1", [jobId])).rows[0]!.e;
  await client.query("set local hnsw.iterative_scan = 'relaxed_order'");
  const { rows } = await client.query<{ "QUERY PLAN": string }>(
    `explain select cc.candidate_id from public.candidate_chunks cc
       join public.candidates c on c.id = cc.candidate_id
      order by cc.embedding <=> $1::extensions.vector limit 300`,
    [vec],
  );
  const plan = rows.map((r) => r["QUERY PLAN"]).join("\n");
  if (plan.includes(HNSW_INDEX)) return "HNSW index scan";
  if (/Seq Scan on candidate_chunks/.test(plan)) return "sequential scan + top-N sort (exact)";
  return "other";
}

async function withoutHnsw<T>(client: pg.PoolClient, fn: () => Promise<T>): Promise<T> {
  await client.query("begin");
  try {
    await client.query(`drop index public.${HNSW_INDEX}`);
    return await fn();
  } finally {
    await client.query("rollback");
  }
}

function bootstrapCi(values: number[], seed = 1, iterations = 2000): [number, number] {
  const rng = createRng(seed);
  const means: number[] = [];
  for (let i = 0; i < iterations; i++) {
    let sum = 0;
    for (let j = 0; j < values.length; j++) sum += values[rng.int(0, values.length - 1)] as number;
    means.push(sum / values.length);
  }
  return [percentile(means, 2.5), percentile(means, 97.5)];
}

interface QualityRow {
  mode: string;
  queries: number;
  recallAt10: number;
  recallCi: [number, number];
  mrr: number;
  mrrCi: [number, number];
}

async function idMaps(pool: pg.Pool, dataset: SeedDataset) {
  const jobsByHash = new Map(
    (await pool.query<{ id: string; content_hash: string }>("select id, content_hash from public.jobs")).rows.map((r) => [r.content_hash, r.id]),
  );
  const candsByHash = new Map(
    (await pool.query<{ id: string; content_hash: string }>("select id, content_hash from public.candidates")).rows.map((r) => [
      r.content_hash,
      r.id,
    ]),
  );
  const jobId = (i: number) => {
    const id = jobsByHash.get(IngestionService.jobContentHash(dataset.jobs[i]!.input));
    if (!id) throw new Error(`seed job ${i} not found in the database; run \`pnpm seed\` with --seed=${dataset.seed}`);
    return id;
  };
  const candidateId = (i: number) => {
    const id = candsByHash.get(sha256Hex(new TextEncoder().encode(dataset.candidates[i]!.resumeText)));
    if (!id) throw new Error(`seed candidate ${i} not found in the database; run \`pnpm seed\` with --seed=${dataset.seed}`);
    return id;
  };
  return { jobId, candidateId };
}

async function environmentInfo(pool: pg.Pool) {
  const pgVersion = (await pool.query<{ v: string }>("select current_setting('server_version') as v")).rows[0]!.v;
  const vectorVersion = (await pool.query<{ v: string }>("select extversion as v from pg_extension where extname = 'vector'")).rows[0]?.v;
  let commit = "unknown";
  try {
    commit = execSync("git rev-parse --short HEAD", { cwd: repoRoot }).toString().trim();
    // Flag runs made with uncommitted changes so numbers are traceable to exact code.
    if (execSync("git status --porcelain -- packages supabase scripts apps", { cwd: repoRoot }).toString().trim()) commit += "-dirty";
  } catch {
    /* not a git checkout */
  }
  return {
    date: new Date().toISOString(),
    commit,
    node: process.version,
    cpu: os.cpus()[0]?.model ?? "unknown",
    cores: os.cpus().length,
    memoryGb: Math.round(os.totalmem() / 1024 ** 3),
    platform: `${os.type()} ${os.release()}`,
    postgres: pgVersion,
    pgvector: vectorVersion ?? "missing",
  };
}

async function counts(pool: pg.Pool) {
  const { rows } = await pool.query<{ jobs: number; candidates: number; chunks: number; models: string[] }>(
    `select (select count(*) from public.jobs)::int as jobs,
            (select count(*) from public.candidates)::int as candidates,
            (select count(*) from public.candidate_chunks)::int as chunks,
            array(select distinct embedding_model from public.candidate_chunks
                  union select distinct embedding_model from public.jobs) as models`,
  );
  return rows[0]!;
}

async function scaleRun(basePool: pg.Pool, embedderModel: string) {
  const url = new URL(process.env.DATABASE_URL!);
  const name = `tm_bench_scale_${Date.now()}`;
  await basePool.query(`create database ${name}`);
  url.pathname = `/${name}`;
  const env = { ...process.env, DATABASE_URL: url.toString() };
  let pool = createPool(env);
  try {
    await applyMigrations(pool, {
      migrationsDir: path.join(repoRoot, "supabase/migrations"),
      localRolesFile: path.join(repoRoot, "supabase/local/00_supabase_roles.sql"),
    });
    await pool.end();
    pool = createPool(env);
    const embedder = createEmbedder(process.env);
    if (embedder.model !== embedderModel) throw new Error("embedder changed between runs");
    const service = new IngestionService({
      repository: new PgIngestionRepository(pool),
      embedder,
      extractText: async (b) => new TextDecoder().decode(b),
    });
    const dataset = generateDataset({ seed: SEED + 1, jobs: 200, candidates: SCALE });
    console.log(`[bench] scale: ingesting ${dataset.jobs.length} jobs + ${dataset.candidates.length} resumes into ${name} ...`);
    const t0 = performance.now();
    for (const j of dataset.jobs) await service.ingestJob(j.input, { isSynthetic: true });
    let next = 0;
    await Promise.all(
      Array.from({ length: 8 }, async () => {
        while (next < dataset.candidates.length) {
          const c = dataset.candidates[next++]!;
          await service.ingestResume({
            bytes: new TextEncoder().encode(c.resumeText),
            mime: "text/plain",
            filename: null,
            fields: c.fields,
            isSynthetic: true,
          });
          if (next % 5000 === 0) console.log(`[bench]   ${next}/${dataset.candidates.length}`);
        }
      }),
    );
    // Separate statements: VACUUM cannot run inside the implicit transaction of a multi-statement query.
    await pool.query("vacuum analyze public.candidate_chunks");
    await pool.query("analyze public.candidates");
    await pool.query("analyze public.jobs");
    const ingestSeconds = (performance.now() - t0) / 1000;
    const c = await counts(pool);
    console.log(`[bench] scale: ${c.candidates} candidates / ${c.chunks} chunks in ${ingestSeconds.toFixed(0)}s`);

    const jobIds = (await pool.query<{ id: string }>("select id from public.jobs order by content_hash")).rows.map((r) => r.id);
    const client = await pool.connect();
    const latency: LatencyRow[] = [];
    let planOn = "";
    let planOff = "";
    let annOverlap = 0;
    try {
      const scale = `${c.candidates} candidates / ${c.chunks} chunks`;
      await client.query("begin");
      planOn = await annPlan(client, jobIds[0]!);
      await client.query("rollback");
      for (const mode of MODES) latency.push(await measureLatency(client, jobIds, mode, SCALE_REPS, { scale, hnsw: "on" }));
      const approx = new Map<string, string[]>();
      for (const id of jobIds) approx.set(id, await search(client, id, MODES[1]!));
      await withoutHnsw(client, async () => {
        planOff = await annPlan(client, jobIds[0]!);
        for (const mode of MODES) latency.push(await measureLatency(client, jobIds, mode, SCALE_REPS, { scale, hnsw: "off" }));
        const overlaps: number[] = [];
        for (const id of jobIds) {
          const exact = new Set(await search(client, id, MODES[1]!));
          overlaps.push(approx.get(id)!.filter((x) => exact.has(x)).length / Math.max(1, exact.size));
        }
        annOverlap = mean(overlaps);
      });
    } finally {
      client.release();
    }
    return { database: name, counts: c, ingestSeconds, planOn, planOff, annOverlap, latency };
  } finally {
    await pool.end();
    await basePool.query(`drop database if exists ${name} with (force)`);
  }
}

const fmt = (n: number, d = 2) => n.toFixed(d);
const ci = ([a, b]: [number, number]) => `[${fmt(a, 3)}, ${fmt(b, 3)}]`;

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const pool = createPool({ ...process.env, DATABASE_POOL_MAX: "2" });
  try {
    const env = await environmentInfo(pool);
    const c = await counts(pool);
    if (c.models.length !== 1) throw new Error(`expected exactly one embedding model in the DB, found: ${c.models.join(", ") || "none"}`);
    const embeddingModel = c.models[0]!;
    console.log(`[bench] ${c.jobs} jobs, ${c.candidates} candidates, ${c.chunks} chunks, embeddings=${embeddingModel}`);

    const dataset = generateDataset({ seed: SEED });
    const labels = buildLabelledSet(dataset);
    const { jobId, candidateId } = await idMaps(pool, dataset);
    const queries = labels.map((q) => ({
      jobId: jobId(q.jobIndex),
      relevant: new Set(q.relevantCandidateIndexes.map(candidateId)),
    }));
    const pairs = labels.reduce((n, q) => n + q.relevantCandidateIndexes.length, 0);
    const ceiling = mean(queries.map((q) => Math.min(K, q.relevant.size) / q.relevant.size));

    const client = await pool.connect();
    const quality: QualityRow[] = [];
    const latency: LatencyRow[] = [];
    let planOn = "";
    let planOff = "";
    try {
      for (const mode of [...MODES, ...SWEEP]) {
        const recalls: number[] = [];
        const rrs: number[] = [];
        for (const q of queries) {
          const ranked = await search(client, q.jobId, mode, K);
          recalls.push(recallAtK(ranked, q.relevant, K));
          rrs.push(reciprocalRank(ranked, q.relevant));
        }
        quality.push({
          mode: mode.name,
          queries: queries.length,
          recallAt10: mean(recalls),
          recallCi: bootstrapCi(recalls),
          mrr: mean(rrs),
          mrrCi: bootstrapCi(rrs),
        });
      }

      const allJobIds = (await pool.query<{ id: string }>("select id from public.jobs order by content_hash")).rows.map((r) => r.id);
      const scale = `${c.candidates} candidates / ${c.chunks} chunks`;
      await client.query("begin");
      planOn = await annPlan(client, allJobIds[0]!);
      await client.query("rollback");
      for (const mode of MODES) latency.push(await measureLatency(client, allJobIds, mode, REPS, { scale, hnsw: "on" }));
      await withoutHnsw(client, async () => {
        planOff = await annPlan(client, allJobIds[0]!);
        for (const mode of MODES) latency.push(await measureLatency(client, allJobIds, mode, REPS, { scale, hnsw: "off" }));
      });
    } finally {
      client.release();
    }

    const scaleResult = SCALE > 0 ? await scaleRun(pool, embeddingModel) : null;

    const results = { env, embeddingModel, counts: c, labelled: { queries: queries.length, pairs, recallCeiling: ceiling }, quality, latency, planOn, planOff, scale: scaleResult };
    writeFileSync(path.join(repoRoot, "benchmark-results.json"), `${JSON.stringify(results, null, 2)}\n`);
    writeFileSync(path.join(repoRoot, "BENCHMARK.md"), renderMarkdown(results));
    console.log("[bench] wrote BENCHMARK.md and benchmark-results.json");
    console.table(quality.map((q) => ({ mode: q.mode, "Recall@10": fmt(q.recallAt10, 3), MRR: fmt(q.mrr, 3) })));
    console.table([...latency, ...(scaleResult?.latency ?? [])].map((l) => ({ scale: l.scale, hnsw: l.hnsw, mode: l.mode, p50: fmt(l.p50), p95: fmt(l.p95) })));
  } finally {
    await pool.end();
  }
}

type Results = {
  env: Awaited<ReturnType<typeof environmentInfo>>;
  embeddingModel: string;
  counts: Awaited<ReturnType<typeof counts>>;
  labelled: { queries: number; pairs: number; recallCeiling: number };
  quality: QualityRow[];
  latency: LatencyRow[];
  planOn: string;
  planOff: string;
  scale: Awaited<ReturnType<typeof scaleRun>> | null;
};

function renderMarkdown(r: Results): string {
  const isHash = r.embeddingModel === "local-hash-v1";
  const latencyTable = (rows: LatencyRow[]) =>
    [
      "| Data | HNSW index | Mode | Samples | p50 (ms) | p95 (ms) | Mean (ms) |",
      "|---|---|---|---:|---:|---:|---:|",
      ...rows.map((l) => `| ${l.scale} | ${l.hnsw} | ${l.mode} | ${l.samples} | ${fmt(l.p50)} | ${fmt(l.p95)} | ${fmt(l.mean)} |`),
    ].join("\n");

  const lines = [
    "# TalentMatch benchmark",
    "",
    "> Generated by `scripts/benchmark.ts` — do not edit by hand. Re-run with `pnpm benchmark" + (r.scale ? ` --scale=${r.scale.counts.candidates}` : "") + "`.",
    "> Raw numbers: `benchmark-results.json`.",
    "",
    "## Setup",
    "",
    `- Date: ${r.env.date} · commit \`${r.env.commit}\``,
    `- Data: **synthetic** seed (seed=${SEED}): ${r.counts.jobs} jobs, ${r.counts.candidates} resumes, ${r.counts.chunks} resume chunks`,
    `- Embeddings: \`${r.embeddingModel}\`${isHash ? " — **the offline feature-hashing embedder, NOT an OpenAI model** (see caveats)" : ""}`,
    `- Postgres ${r.env.postgres} + pgvector ${r.env.pgvector}, local Docker container; client on the same host`,
    `- Machine: ${r.env.cpu}, ${r.env.cores} vCPUs, ${r.env.memoryGb} GB RAM, ${r.env.platform}, Node ${r.env.node}`,
    "",
    "## Retrieval quality (job → candidates)",
    "",
    `Labelled set: **${r.labelled.queries} jobs, ${r.labelled.pairs} job→relevant-candidate pairs**, built by \`buildLabelledSet()\` from the generator's ground truth: a candidate is relevant if they are in the job's role family, within ±1 seniority level, and truly have ≥60% of the job's required skills (whether the resume *names* the skill or only *describes* it). Each labelled job has 3–10 relevant candidates.`,
    "",
    "| Mode | Recall@10 | 95% CI | MRR | 95% CI |",
    "|---|---:|---|---:|---|",
    ...r.quality.map((q) => `| ${q.mode} | ${fmt(q.recallAt10, 3)} | ${ci(q.recallCi)} | ${fmt(q.mrr, 3)} | ${ci(q.mrrCi)} |`),
    "",
    `Max achievable Recall@10 on this set is ${fmt(r.labelled.recallCeiling, 3)} (every labelled job has ≤10 relevant candidates). CIs are percentile bootstrap over queries (2,000 resamples). Rows below the first three are a small weight/k sweep of the same RPC; they were not used to choose the defaults.`,
    "",
    "## Latency of the hybrid search RPC",
    "",
    `\`select * from match_candidates_for_job(job_id, 10, …)\` for every job, ${REPS} repetition(s) each after ${WARMUP} warm-up calls; wall-clock measured by the client. "HNSW off" = \`${HNSW_INDEX}\` dropped inside a transaction that is rolled back.`,
    "",
    latencyTable(r.latency),
    "",
    `Planner's choice for the ANN step at this size: with the index → **${r.planOn}**; without → **${r.planOff}**.`,
  ];

  if (r.scale) {
    lines.push(
      "",
      `### At larger scale (${r.scale.counts.candidates} synthetic resumes)`,
      "",
      `A throwaway database with the same 200-job generator and ${r.scale.counts.candidates} generated resumes (${r.scale.counts.chunks} chunks; ingest took ${fmt(r.scale.ingestSeconds, 0)} s). ${SCALE_REPS} repetition(s) per job.`,
      "",
      latencyTable(r.scale.latency),
      "",
      `Planner's choice: with the index → **${r.scale.planOn}**; without → **${r.scale.planOff}**.`,
      `HNSW accuracy: mean overlap between vector-only top-10 with the index and exact top-10 without it = **${fmt(r.scale.annOverlap, 3)}** (ef_search=100, iterative scan relaxed_order).`,
    );
  }

  lines.push(
    "",
    "## Caveats (read before quoting any number)",
    "",
    ...(isHash
      ? [
          "- **Embeddings are not semantic.** This run used `local-hash-v1`, a deterministic feature-hashing embedder (word + character-trigram hashing), because no OpenAI credits were available. \"Vector-only\" here measures sub-word lexical similarity, not meaning; it cannot connect a description like \"orchestrated containerised workloads\" to *Kubernetes*. Re-run with `EMBEDDINGS_PROVIDER=openai` (re-seed with `--reset`) to measure `text-embedding-3-small`.",
        ]
      : []),
    "- **Synthetic data.** Resumes and jobs are template-generated, so absolute numbers say little about real recruiting data. Relevance labels come from the generator's skill tags, which the keyword retriever can partly see (named skills are also extracted into the indexed `skills` column); this favours keyword search.",
    "- **Small labelled set.** With ~40 queries the confidence intervals are wide; overlapping CIs mean the difference is not established.",
    "- **Latency** is a single-client, warm-cache, same-host measurement on a shared cloud VM; it excludes network and HTTP overhead and is not a throughput test.",
    "- At seed scale the planner may ignore the HNSW index entirely (exact scan is cheaper for under ~1k vectors), so \"HNSW on/off\" can be identical there; see the scale section for where the index matters.",
    "",
  );
  return lines.join("\n");
}

await main();
