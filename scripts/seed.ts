/**
 * Seed ~200 SYNTHETIC jobs and ~500 SYNTHETIC resumes through the real ingestion
 * pipeline (clean -> chunk -> embed -> store). Every row has is_synthetic = true.
 *
 *   pnpm seed                         # uses EMBEDDINGS_PROVIDER from .env
 *   pnpm seed --reset                 # delete existing synthetic rows first
 *   pnpm seed --jobs=200 --candidates=500 --seed=42 --concurrency=32
 *
 * Re-running is idempotent (content hashes), so an interrupted seed can resume.
 */
import { createPool, PgIngestionRepository } from "@talentmatch/core/db";
import { BatchingEmbedder, createEmbedder } from "@talentmatch/core/embeddings";
import { IngestionService } from "@talentmatch/core/ingest";
import { generateDataset } from "@talentmatch/core/seed";
import { flag, loadDotEnv, option } from "./env";

loadDotEnv();

const jobsCount = Number(option("jobs") ?? 200);
const candidatesCount = Number(option("candidates") ?? 500);
const seed = Number(option("seed") ?? 42);
const concurrency = Number(option("concurrency") ?? 32);

const pool = createPool(process.env);
// Concurrent resumes share provider requests (up to 96 inputs each).
const embedder = new BatchingEmbedder(createEmbedder(process.env));
const service = new IngestionService({
  repository: new PgIngestionRepository(pool),
  embedder,
  extractText: async (bytes) => new TextDecoder().decode(bytes),
});

async function mapLimit<T>(items: readonly T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++] as T;
      await fn(item);
    }
  });
  await Promise.all(workers);
}

try {
  if (flag("reset")) {
    const jobs = await pool.query("delete from public.jobs where is_synthetic");
    const cands = await pool.query("delete from public.candidates where is_synthetic");
    console.log(`[seed] reset: deleted ${jobs.rowCount} synthetic jobs, ${cands.rowCount} synthetic candidates`);
  }

  const { rows: models } = await pool.query<{ embedding_model: string }>(
    `select distinct embedding_model from public.jobs
     union select distinct embedding_model from public.candidate_chunks`,
  );
  const foreign = models.map((m) => m.embedding_model).filter((m) => m !== embedder.model);
  if (foreign.length > 0) {
    throw new Error(
      `database already contains vectors from ${foreign.join(", ")}; embedder is ${embedder.model}. ` +
        "Vectors from different models are not comparable. Re-run with --reset (deletes synthetic rows).",
    );
  }

  const dataset = generateDataset({ seed, jobs: jobsCount, candidates: candidatesCount });
  console.log(`[seed] embedder=${embedder.model} seed=${seed} jobs=${dataset.jobs.length} candidates=${dataset.candidates.length}`);
  const started = Date.now();

  let created = 0;
  let duplicates = 0;
  await mapLimit(dataset.jobs, concurrency, async (job) => {
    const out = await service.ingestJob(job.input, { isSynthetic: true });
    if (out.duplicate) duplicates++;
    else created++;
  });
  console.log(`[seed] jobs: ${created} created, ${duplicates} already present`);

  created = 0;
  duplicates = 0;
  let chunks = 0;
  let done = 0;
  await mapLimit(dataset.candidates, concurrency, async (candidate) => {
    const out = await service.ingestResume({
      bytes: new TextEncoder().encode(candidate.resumeText),
      mime: "text/plain",
      filename: `synthetic-resume-${String(candidate.index).padStart(3, "0")}.txt`,
      fields: candidate.fields,
      isSynthetic: true,
    });
    if (out.duplicate) duplicates++;
    else {
      created++;
      chunks += out.chunkCount ?? 0;
    }
    if (++done % 100 === 0) console.log(`[seed]   ${done}/${dataset.candidates.length} resumes`);
  });
  console.log(`[seed] candidates: ${created} created (${chunks} chunks), ${duplicates} already present`);

  await pool.query("analyze public.jobs, public.candidates, public.candidate_chunks");
  console.log(`[seed] done in ${((Date.now() - started) / 1000).toFixed(1)}s`);
} finally {
  await pool.end();
}
