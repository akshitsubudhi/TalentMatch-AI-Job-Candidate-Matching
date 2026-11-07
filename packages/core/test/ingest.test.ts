import { describe, expect, it, vi } from "vitest";
import { HashingEmbedder } from "../src/embeddings";
import { AppError } from "../src/errors";
import { IngestionService, type IngestionRepository, type NewCandidateRow, type NewChunkRow, type NewJobRow } from "../src/ingest";
import { JobCreateInputSchema } from "../src/schemas";

export class MemoryRepo implements IngestionRepository {
  jobs = new Map<string, NewJobRow & { id: string }>();
  candidates = new Map<string, NewCandidateRow & { id: string; chunks: NewChunkRow[] }>();
  private seq = 0;
  async findJobIdByHash(h: string) {
    return [...this.jobs.values()].find((j) => j.contentHash === h)?.id ?? null;
  }
  async insertJob(row: NewJobRow) {
    const existing = await this.findJobIdByHash(row.contentHash);
    if (existing) return { id: existing, created: false };
    const id = `job-${++this.seq}`;
    this.jobs.set(id, { ...row, id });
    return { id, created: true };
  }
  async findCandidateIdByHash(h: string) {
    return [...this.candidates.values()].find((c) => c.contentHash === h)?.id ?? null;
  }
  async insertCandidateWithChunks(row: NewCandidateRow, chunks: NewChunkRow[]) {
    const existing = await this.findCandidateIdByHash(row.contentHash);
    if (existing) return { id: existing, created: false };
    const id = `cand-${++this.seq}`;
    this.candidates.set(id, { ...row, id, chunks });
    return { id, created: true };
  }
}

const textExtractor = async (bytes: Uint8Array) => new TextDecoder().decode(bytes);
const fields = { fullName: "Test Person", location: "Remote", seniority: "mid" as const, headline: "Data engineer", skills: ["Python"] };
const resume = (extra = "") =>
  new TextEncoder().encode(
    `Data engineer with 5 years building ETL pipelines in Airflow and dbt on Snowflake. Uses Postgres daily. ${extra}`,
  );

describe("IngestionService", () => {
  it("ingests a resume: clean -> chunk -> embed -> store, with extracted skills", async () => {
    const repo = new MemoryRepo();
    const svc = new IngestionService({ repository: repo, embedder: new HashingEmbedder(), extractText: textExtractor });
    const out = await svc.ingestResume({ bytes: resume(), mime: "text/plain", filename: "cv.txt", fields });
    expect(out.duplicate).toBe(false);
    expect(out.chunkCount).toBe(1);
    const stored = repo.candidates.get(out.id)!;
    expect(stored.skills).toEqual(expect.arrayContaining(["Python", "Airflow", "dbt", "Snowflake", "PostgreSQL", "ETL"]));
    expect(stored.chunks[0]!.embedding).toHaveLength(1536);
    expect(stored.chunks[0]!.embeddingModel).toBe("local-hash-v1");
    expect(stored.contentHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is idempotent on file content: no re-embedding, no duplicate", async () => {
    const repo = new MemoryRepo();
    const embedder = new HashingEmbedder();
    const spy = vi.spyOn(embedder, "embed");
    const svc = new IngestionService({ repository: repo, embedder, extractText: textExtractor });
    const a = await svc.ingestResume({ bytes: resume(), mime: "text/plain", filename: "a.txt", fields });
    const b = await svc.ingestResume({ bytes: resume(), mime: "text/plain", filename: "renamed.txt", fields: { ...fields, fullName: "Other" } });
    expect(b).toEqual({ id: a.id, duplicate: true });
    expect(repo.candidates.size).toBe(1);
    expect(spy).toHaveBeenCalledTimes(1);
    const c = await svc.ingestResume({ bytes: resume("Also Kafka."), mime: "text/plain", filename: "a.txt", fields });
    expect(c.duplicate).toBe(false);
    expect(repo.candidates.size).toBe(2);
  });

  it("chunks long resumes into multiple embedded chunks", async () => {
    const repo = new MemoryRepo();
    const svc = new IngestionService({
      repository: repo,
      embedder: new HashingEmbedder(),
      extractText: textExtractor,
      chunkOptions: { maxTokens: 64, overlapTokens: 8 },
    });
    const long = Array.from({ length: 40 }, (_, i) => `Delivered project ${i} using Python and Spark.`).join(" ");
    const out = await svc.ingestResume({ bytes: new TextEncoder().encode(long), mime: "text/plain", filename: null, fields });
    expect(out.chunkCount).toBeGreaterThan(3);
    expect(repo.candidates.get(out.id)!.chunks.map((c) => c.chunkIndex)).toEqual(
      Array.from({ length: out.chunkCount! }, (_, i) => i),
    );
  });

  it("rejects resumes with too little text (e.g. scanned PDFs) with 422", async () => {
    const svc = new IngestionService({ repository: new MemoryRepo(), embedder: new HashingEmbedder(), extractText: textExtractor });
    await expect(
      svc.ingestResume({ bytes: new TextEncoder().encode("  \n 1 \n"), mime: "text/plain", filename: null, fields }),
    ).rejects.toMatchObject({ status: 422, code: "unprocessable_content" });
  });

  it("maps extractor failures to 422", async () => {
    const svc = new IngestionService({
      repository: new MemoryRepo(),
      embedder: new HashingEmbedder(),
      extractText: async () => {
        throw new Error("bad xref table");
      },
    });
    const err = await svc.ingestResume({ bytes: resume(), mime: "application/pdf", filename: null, fields }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).status).toBe(422);
  });

  it("job ingestion is idempotent and hash ignores skill order", async () => {
    const repo = new MemoryRepo();
    const svc = new IngestionService({ repository: repo, embedder: new HashingEmbedder(), extractText: textExtractor });
    const job = JobCreateInputSchema.parse({
      title: "ML Engineer",
      description: "Train and deploy PyTorch models to production.",
      location: "Remote",
      seniority: "mid",
      skills: ["PyTorch", "Python"],
    });
    const a = await svc.ingestJob(job);
    const b = await svc.ingestJob({ ...job, skills: ["Python", "PyTorch"] });
    expect(a.duplicate).toBe(false);
    expect(b).toEqual({ id: a.id, duplicate: true });
    expect(repo.jobs.size).toBe(1);
  });
});
