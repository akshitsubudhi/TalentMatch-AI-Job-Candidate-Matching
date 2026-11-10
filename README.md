# TalentMatch

TalentMatch matches jobs and candidates in both directions. Recruiters post jobs and candidates upload resumes (PDF or text). A separate Express service parses, cleans, chunks and embeds each resume, idempotently. Matching runs as a single PostgreSQL function that combines **full-text search** (tsvector + GIN) with **pgvector cosine similarity** (HNSW) using **weighted Reciprocal Rank Fusion**. Location and seniority filters are applied in SQL *before* ranking. For the top matches an LLM writes a short "why this fits", plus matched and missing skills, as **zod-validated structured JSON**. The result is cached per `(job, candidate, prompt_version)`. Every number in this README comes from `scripts/benchmark.ts` ([BENCHMARK.md](BENCHMARK.md)), and the demo runs entirely on clearly labelled **synthetic** data.

> **Status, plainly:** everything below is implemented and tested (142 automated tests, CI). The OpenAI paths were verified **live**: embeddings with `text-embedding-3-small`, and structured explanations with `gpt-5-mini` through the running app (validated JSON, cached on the second request). All benchmark numbers come from `text-embedding-3-small` on synthetic data. See [Limitations](#limitations).

## Architecture

```mermaid
flowchart LR
  subgraph Browser
    UI["Next.js pages<br/>(jobs, candidates, upload)"]
  end
  subgraph Vercel["Next.js 15 app (server)"]
    RSC["Server components<br/>+ route handlers"]
    EXP["/api/explanations<br/>(LLM + cache)"]
    ING["/api/ingest/*<br/>(zod-validated proxy)"]
  end
  subgraph API["Express ingestion API (Docker)"]
    PIPE["parse PDF → clean → chunk<br/>→ embed → upsert (sha256 dedupe)"]
  end
  subgraph Supabase["Supabase Postgres + pgvector"]
    T[("jobs · candidates<br/>candidate_chunks · match_explanations")]
    RPC["match_candidates_for_job()<br/>match_jobs_for_candidate()<br/>FTS + HNSW + RRF"]
  end
  OAI["OpenAI<br/>text-embedding-3-small<br/>chat model (JSON schema)"]

  UI --> RSC
  UI -- fetch --> EXP
  UI -- form post --> ING
  ING -- "x-api-key (server-side)" --> PIPE
  PIPE -- embeddings --> OAI
  PIPE -- "pg (DATABASE_URL)" --> T
  RSC -- "supabase-js (service role, server only)" --> RPC
  RPC --> T
  EXP -- "cache miss" --> OAI
  EXP --> T
```

| Path | What it is |
|---|---|
| `apps/web` | Next.js 15 App Router + TypeScript (strict) + Tailwind v4. Pages, route handlers, server-only Supabase client. |
| `apps/api` | Express 5 ingestion API: `POST /v1/jobs`, `POST /v1/candidates` (multipart), `/health`, `/health/ready`. Dockerfile. |
| `packages/core` | Shared library: zod schemas, text cleaning, chunking, RRF, skills vocabulary, embedders, explainer and cache, ingestion service, pg repository, migration runner, synthetic data generator. |
| `supabase/migrations` | Schema, indexes, RLS and the hybrid search RPCs. |
| `supabase/local` | Only for local runs and CI: a Supabase role bootstrap and a gateway config for running without a Supabase project. |
| `scripts` | `migrate.ts`, `seed.ts`, `benchmark.ts`, `dev-keys.ts`. |

### Data model

- `jobs`: title, description, location, seniority, `skills text[]`, `embedding vector(1536)`, a generated `fts tsvector` (title and skills weighted A, description B), `content_hash` (unique).
- `candidates`: name, headline, location, seniority, `skills` (entered by the uploader plus skills extracted from the text), `resume_text`, a generated `fts`, and `content_hash`, the sha256 of the uploaded **bytes** (unique).
- `candidate_chunks`: `(candidate_id, chunk_index)` unique, `content`, `embedding vector(1536)`, `embedding_model`.
- `match_explanations`: unique `(job_id, candidate_id, prompt_version)`, `summary`, `matched_skills`, `missing_skills`, `model`.
- Indexes: HNSW (`vector_cosine_ops`, m=16, ef_construction=64) on both embedding columns, GIN on both `fts` columns, B-tree on `location` / `seniority` and on foreign keys. Every table has `created_at`/`updated_at` with triggers, NOT NULL and CHECK constraints, and `ON DELETE CASCADE` foreign keys.
- **RLS is enabled on every table.** `anon`/`authenticated` can only `SELECT` from `jobs`. Resumes, chunks and explanations have no policies for them, so they get nothing, and the match RPCs are `EXECUTE`-revoked from them. Writes and matching happen server-side only, through the service role or a direct DB connection. The DB tests assert all of this.

## How hybrid search and RRF work

Both RPCs (`supabase/migrations/20261107000003_hybrid_search.sql`) run two retrievers over the **same filtered set** and fuse their rankings:

1. **Keyword:** an OR-query is built from the stemmed lexemes of the job's title and skills (`tm_keyword_query`). Candidates are ranked by `ts_rank` over a weighted `tsvector` that has a GIN index.
2. **Semantic:** an ANN search orders resume chunks by `embedding <=> job_embedding` (cosine distance) through the HNSW index, with `hnsw.iterative_scan = relaxed_order` so filters don't starve the result set. A candidate's distance is the distance of their **closest chunk**. For candidate→jobs, each chunk queries the jobs index and each job keeps its best chunk.
3. **Fusion:** Reciprocal Rank Fusion with configurable weights:

   ```
   rrf(d) = w_keyword / (k + rank_keyword(d)) + w_semantic / (k + rank_semantic(d))
   ```

   A list that doesn't contain `d` contributes 0. RRF uses only ranks, so it needs no score calibration between `ts_rank` scores and cosine distances, which aren't comparable. `k` (default 60) controls how much the very top ranks dominate.
4. Filters (`p_location`, `p_seniority`) are `WHERE` clauses inside **both** retrieval CTEs, so a filtered-out row can never take a rank slot. A weight of `0` disables a retriever entirely: it's a parameter-only predicate, which Postgres evaluates once and then skips that subtree. That's how the benchmark measures keyword-only and vector-only on the same code path.

Weights and `k` are configurable per request (RPC args, and the `?kw=&sem=&k=` URL params on detail pages) and by default through `SEARCH_KEYWORD_WEIGHT`, `SEARCH_SEMANTIC_WEIGHT` and `SEARCH_RRF_K`. A TypeScript reference implementation (`packages/core/src/search/rrf.ts`) is unit-tested, and a DB test checks that the SQL fusion returns exactly the same order and scores.

The UI's "fusion" score is `rrf / max_possible_rrf × 100`, which equals 100 when a document is rank 1 in every active list. It measures agreement between the two retrievers, **not** a probability of fit, and the UI says so.

## Benchmark

Full report: **[BENCHMARK.md](BENCHMARK.md)**, generated by `pnpm benchmark --scale=20000` at commit `2d11c54` on a 4-vCPU cloud VM (Postgres 16.15, pgvector 0.8.7). Embeddings: **`text-embedding-3-small`**. Data and labels are **synthetic**.

**Retrieval quality.** Labelled set: 40 jobs, 238 job→relevant-candidate pairs. 95% bootstrap CIs in brackets.

| Mode | Recall@10 | MRR |
|---|---|---|
| keyword-only | 0.431 [0.367, 0.497] | 0.663 [0.534, 0.780] |
| vector-only | 0.445 [0.393, 0.500] | 0.554 [0.453, 0.666] |
| hybrid (RRF, w=1/1, k=60) | 0.502 [0.438, 0.567] | 0.701 [0.594, 0.806] |

Paired differences (same queries, bootstrap of per-query differences):

| Comparison | ΔRecall@10 [95% CI] | ΔMRR [95% CI] |
|---|---|---|
| hybrid − keyword-only | +0.070 [0.013, 0.129] | +0.038 [-0.062, 0.133] |
| hybrid − vector-only | +0.057 [0.005, 0.110] | +0.147 [0.037, 0.261] |

**Latency** of `match_candidates_for_job`, p50 / p95 in ms, single client on the same host:

| Data | Mode | HNSW on | HNSW off (exact) |
|---|---|---|---|
| 500 resumes / 862 chunks | vector-only | 5.5 / 8.4 | 4.8 / 7.2 |
| 500 resumes / 862 chunks | hybrid | 9.7 / 13.9 | 9.8 / 14.2 |
| 20,000 resumes / 34,506 chunks | keyword-only | 146.0 / 213.8 | 148.4 / 229.9 |
| 20,000 resumes / 34,506 chunks | vector-only | 12.8 / 16.4 | 121.1 / 136.0 |
| 20,000 resumes / 34,506 chunks | hybrid | 166.7 / 236.0 | 282.8 / 362.4 |

What the numbers say, and don't say:

- **Hybrid retrieves more of the relevant candidates than either retriever alone.** Recall@10 is +0.070 vs keyword-only and +0.057 vs vector-only, and both paired CIs exclude 0. Hybrid also ranks the first relevant candidate higher than vector-only (MRR +0.147). Its MRR gain over keyword-only (+0.038) is **not** established: that CI includes 0.
- **A plausible reason (not separately measured):** each synthetic resume names some skills and only *describes* others. Keyword search can't see the described ones, and the embeddings may match exact skill names less sharply. The rows below the main three in BENCHMARK.md are a small weight/`k` sweep. It was run after choosing the defaults (1/1, k=60), and the defaults were not changed.
- **HNSW matters at scale, not at demo scale.** At 34,506 chunks, vector-only p50 drops from 121.1 ms (exact scan) to 12.8 ms with HNSW (9.5×). Its top-10 overlaps exact search 0.994 of the time. At 862 chunks the planner correctly ignores the index.
- **Keyword ranking dominates hybrid latency at scale:** about 146 ms p50 on its own, because `ts_rank` scores every resume that matches the OR-query. That's the next thing to optimise.
- **Profiling at 20k resumes found two bugs, fixed before these numbers** (commit `9150fc3`). PL/pgSQL generic plans ignored the HNSW index: a one-off profiling run measured vector-only p50 154 ms before vs 12.5 ms after `force_custom_plan`. And `ts_rank_cd` cost about 4× more than `ts_rank`.
- These are synthetic resumes with generator-derived labels, so they show this system's behaviour, not real-world hiring accuracy. Earlier runs with the offline hashing embedder are in git history (`6845ae7`); with a non-semantic embedder, keyword-only beat hybrid.

## Setup

Prerequisites: Node 22+, pnpm 10 (`corepack enable`), Docker.

### 1. Install

```bash
pnpm install
```

```bash
cp .env.example .env
```

### 2a. Database: a Supabase project (recommended)

1. Create a project at supabase.com. The `vector` extension is installed by the first migration.
2. Fill in `.env`:
   - `DATABASE_URL`: Project Settings → Database → connection string (session pooler, port 5432). Set `DATABASE_SSL=verify` with `DATABASE_CA_CERT` (download the CA from the same page) or `DATABASE_SSL=no-verify`.
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`: Project Settings → API.
3. Apply the migrations (either works; they're the same files):

```bash
pnpm db:migrate
```

```bash
supabase link --project-ref <ref> && supabase db push
```

### 2b. Database: fully local, no Supabase account

This starts Postgres 16 + pgvector, PostgREST and a small gateway that serves `/rest/v1` the way Supabase does, so `supabase-js` works unchanged.

```bash
pnpm db:keys >> .env
```

```bash
docker compose --profile local up -d db rest gateway
```

```bash
pnpm db:migrate --local-roles
```

Keep `DATABASE_URL=postgres://postgres:postgres@localhost:54322/postgres` and `NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321` in `.env`. `--local-roles` creates the `anon`/`authenticated`/`service_role` roles that Supabase normally provides. Never use it against Supabase.

### 3. Embeddings and LLM provider

- With OpenAI: set `OPENAI_API_KEY`, `EMBEDDINGS_PROVIDER=openai`, `EXPLANATIONS_PROVIDER=openai` (`OPENAI_CHAT_MODEL` defaults to `gpt-5-mini`).
- Local and free with [Ollama](https://ollama.com): real semantic embeddings and LLM explanations on your own machine, no API key.

  ```bash
  ollama pull nomic-embed-text && ollama pull llama3.1:8b
  ```

  Then set `EMBEDDINGS_PROVIDER=ollama` and `EXPLANATIONS_PROVIDER=ollama`. `OLLAMA_BASE_URL` defaults to `http://localhost:11434/v1`, Ollama's OpenAI-compatible endpoint; the SDK sends a dummy API key that Ollama ignores. Embedding models narrower than 1536 dimensions (nomic-embed-text is 768) are zero-padded to fit `vector(1536)`, which leaves cosine similarity exactly unchanged. Ollama runs on your machine, so a Vercel deployment can't reach it.
- Offline, free, no model at all: `EMBEDDINGS_PROVIDER=local-hash` and `EXPLANATIONS_PROVIDER=rules`. The UI labels rule-based explanations as such.

Vectors from different models can't be compared. Each row stores `embedding_model`, and the seed refuses to mix models unless you pass `--reset`.

### 4. Seed synthetic data

```bash
pnpm seed
```

This loads 200 jobs and 500 resumes through the real ingestion pipeline. It's idempotent. Concurrent resumes share embedding requests: a micro-batcher sends up to 96 inputs per request, paced under your account's tokens-per-minute limit by `OPENAI_EMBEDDING_TPM`, default 800k. With OpenAI embeddings the seed takes about a minute and costs well under a cent; the 20k-resume benchmark run embeds about 8.6M tokens, roughly $0.17 at $0.02/1M. Use `pnpm seed --reset` to replace the synthetic rows, for example after switching embedding provider.

### 5. Run

```bash
pnpm dev:api
```

```bash
pnpm dev:web
```

Open http://localhost:3000. The API listens on :4000. Run the API in Docker instead with `docker compose up --build api`, and set `COMPOSE_DATABASE_URL` if the database isn't the local compose `db`.

### 6. Test, lint, typecheck, benchmark

```bash
pnpm typecheck && pnpm lint && pnpm test
```

```bash
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:54322/postgres pnpm test:db
```

```bash
pnpm benchmark --scale=20000
```

Tests never call OpenAI: the SDK clients are replaced with mocks. DB tests create and drop their own databases. CI (`.github/workflows/ci.yml`) runs typecheck, lint, unit tests, API integration tests and DB tests against a `pgvector/pgvector:pg16` service, builds both apps and builds the API Docker image.

## Deploy

### Next.js app on Vercel

1. Push this repo to GitHub, then in Vercel choose **Add New → Project** and import it.
2. Set **Root Directory** to `apps/web`. Vercel detects Next.js and pnpm from `pnpm-lock.yaml`, and it installs the whole workspace, so `@talentmatch/core` resolves. Leave the build command (`next build`) and output settings at their defaults.
3. Add environment variables (Project → Settings → Environment Variables). These are server-side, except the `NEXT_PUBLIC_*` ones:
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `OPENAI_CHAT_MODEL`, `EXPLANATIONS_PROVIDER`, `INGEST_API_URL`, `INGEST_API_KEY`, and optionally `SEARCH_KEYWORD_WEIGHT`, `SEARCH_SEMANTIC_WEIGHT`, `SEARCH_RRF_K`, `EXPLAIN_TOP_N`.
4. Deploy. Browsing, matching and explanations only need Supabase and OpenAI. **Uploads need the ingestion API at a public HTTPS URL** in `INGEST_API_URL`. A Vercel function can't reach `localhost` on your laptop, so on a Vercel deployment without a hosted API the upload pages show "ingestion API is unreachable".

### Ingestion API: locally or with Docker

```bash
pnpm dev:api
```

```bash
docker compose up --build api
```

For any container host (Fly.io, Render, Railway, Cloud Run, a VM), build with `docker build -f apps/api/Dockerfile -t talentmatch-api .` from the repo root. Then run it with `NODE_ENV=production`, `DATABASE_URL`, `DATABASE_SSL`, `INGEST_API_KEY`, `EMBEDDINGS_PROVIDER` and `OPENAI_API_KEY`. The container listens on port 4000, runs as a non-root user and has a `/health` healthcheck. Use the same `INGEST_API_KEY` value on Vercel.

## API reference (ingestion service)

All `/v1` routes need `x-api-key: $INGEST_API_KEY` (mandatory when `NODE_ENV=production`) and are rate-limited per IP. Errors always look like `{ "error": { "code", "message", "details?", "requestId" } }`.

| Method | Path | Body | Success |
|---|---|---|---|
| `POST` | `/v1/jobs` | JSON `{ title, description, location, seniority, skills: string[] \| "a, b" }` | `201 { data: { id, duplicate: false } }`, or `200` with `duplicate: true` |
| `POST` | `/v1/candidates` | multipart: `file` (PDF/.txt ≤ 5 MB), `fullName`, `location`, `seniority`, `headline?`, `skills?` | `201 { data: { id, duplicate, chunkCount } }`, or `200` if the same bytes were already ingested |
| `GET` | `/health`, `/health/ready` | | `200` / `503` |

Error statuses: 400 (validation, with field-level `details`), 401, 413, 415, 422 (unreadable or scanned PDF, invalid UTF-8), 429, 502 (embedding provider failed; nothing is written).

## Limitations

- **What was verified live, and what wasn't.** OpenAI embeddings (`text-embedding-3-small`) and explanations (`gpt-5-mini`, JSON-schema output, zod validation, cache hit on repeat) were exercised against the live API, end to end through the app. The Ollama provider is verified only against an Ollama-shaped fake HTTP server, not a live Ollama. The offline `local-hash-v1` embedder is for tests and offline demos; it isn't semantic.
- **Synthetic data, synthetic labels.** The relevance labels come from the generator's ground-truth skills. They aren't human judgements, and they partly reward keyword overlap. Treat retrieval-quality numbers as a regression benchmark for this codebase, not evidence about real hiring data.
- **No authentication.** Anyone who can reach the web app can browse all (synthetic) candidates and upload resumes. The service role is only used server-side, but there's no recruiter login, multi-tenancy or per-org RLS policy yet. Don't put real personal data in a public deployment.
- **Explanations** are only generated for pairs that appear in a top-N list, as a cost guard. Resume text is sent to the LLM without the candidate's name, but it isn't otherwise redacted. There's a prompt-injection instruction, but no injection *detection*.
- **PDF parsing** handles text-based PDFs only (no OCR). Layout-heavy resumes may extract with odd ordering.
- **Token counts** for chunking are estimated (~4 chars/token), not computed with a tokenizer.
- **Operational gaps:** the rate limiter is in-memory (per instance) and there's no job queue, so ingestion is synchronous within the HTTP request. There's no observability stack beyond JSON logs. The Express API isn't deployed anywhere public by this repo, so on Vercel the upload pages need `INGEST_API_URL` pointing at an API you host yourself.
- **Benchmark scope:** single-client, warm-cache latency on one shared VM. At 500 resumes Postgres doesn't even use the HNSW index (an exact scan is cheaper), which the report states.
