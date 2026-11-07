-- TalentMatch schema: jobs, candidates, candidate_chunks, match_explanations.
-- Works on Supabase and on plain PostgreSQL 15+ with pgvector >= 0.8.

create schema if not exists extensions;
create extension if not exists vector with schema extensions;
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- array_to_string() is only STABLE, so it cannot be used in a generated column.
-- This wrapper is safe to mark IMMUTABLE because text[] -> text is deterministic.
create or replace function public.tm_join_text(arr text[])
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select coalesce(pg_catalog.array_to_string(arr, ' '), '')
$$;

create or replace function public.tm_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- jobs
-- ---------------------------------------------------------------------------

create table public.jobs (
  id               uuid primary key default extensions.gen_random_uuid(),
  title            text not null check (char_length(title) between 2 and 200),
  description      text not null check (char_length(description) between 20 and 20000),
  location         text not null check (char_length(location) between 2 and 120),
  seniority        text not null check (seniority in ('intern', 'junior', 'mid', 'senior', 'lead', 'principal')),
  skills           text[] not null default '{}' check (cardinality(skills) <= 50),
  content_hash     text not null unique check (content_hash ~ '^[0-9a-f]{64}$'),
  embedding        extensions.vector(1536) not null,
  embedding_model  text not null,
  is_synthetic     boolean not null default false,
  fts              tsvector generated always as (
                     setweight(to_tsvector('english', title), 'A') ||
                     setweight(to_tsvector('english', public.tm_join_text(skills)), 'A') ||
                     setweight(to_tsvector('english', description), 'B')
                   ) stored,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table public.jobs is 'Job posts created by recruiters (or the synthetic seed).';
comment on column public.jobs.content_hash is 'sha256 of the normalised job payload; makes job ingestion idempotent.';

-- ---------------------------------------------------------------------------
-- candidates
-- ---------------------------------------------------------------------------

create table public.candidates (
  id               uuid primary key default extensions.gen_random_uuid(),
  full_name        text not null check (char_length(full_name) between 1 and 200),
  headline         text not null default '' check (char_length(headline) <= 300),
  location         text not null check (char_length(location) between 2 and 120),
  seniority        text not null check (seniority in ('intern', 'junior', 'mid', 'senior', 'lead', 'principal')),
  skills           text[] not null default '{}' check (cardinality(skills) <= 100),
  resume_text      text not null check (char_length(resume_text) between 1 and 200000),
  source_filename  text,
  source_mime      text not null check (source_mime in ('application/pdf', 'text/plain')),
  content_hash     text not null unique check (content_hash ~ '^[0-9a-f]{64}$'),
  is_synthetic     boolean not null default false,
  fts              tsvector generated always as (
                     setweight(to_tsvector('english', headline), 'A') ||
                     setweight(to_tsvector('english', public.tm_join_text(skills)), 'A') ||
                     setweight(to_tsvector('english', resume_text), 'B')
                   ) stored,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table public.candidates is 'One row per uploaded resume (deduplicated by content_hash of the uploaded bytes).';

-- ---------------------------------------------------------------------------
-- candidate_chunks
-- ---------------------------------------------------------------------------

create table public.candidate_chunks (
  id               uuid primary key default extensions.gen_random_uuid(),
  candidate_id     uuid not null references public.candidates (id) on delete cascade,
  chunk_index      integer not null check (chunk_index >= 0),
  content          text not null check (char_length(content) > 0),
  token_estimate   integer not null check (token_estimate > 0),
  embedding        extensions.vector(1536) not null,
  embedding_model  text not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (candidate_id, chunk_index)
);

-- ---------------------------------------------------------------------------
-- match_explanations (LLM cache)
-- ---------------------------------------------------------------------------

create table public.match_explanations (
  id               uuid primary key default extensions.gen_random_uuid(),
  job_id           uuid not null references public.jobs (id) on delete cascade,
  candidate_id     uuid not null references public.candidates (id) on delete cascade,
  prompt_version   text not null check (char_length(prompt_version) between 1 and 50),
  model            text not null,
  summary          text not null,
  matched_skills   text[] not null default '{}',
  missing_skills   text[] not null default '{}',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (job_id, candidate_id, prompt_version)
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

-- ANN indexes (cosine distance, matches the <=> operator used in the RPCs).
create index candidate_chunks_embedding_hnsw_idx
  on public.candidate_chunks using hnsw (embedding extensions.vector_cosine_ops)
  with (m = 16, ef_construction = 64);
create index jobs_embedding_hnsw_idx
  on public.jobs using hnsw (embedding extensions.vector_cosine_ops)
  with (m = 16, ef_construction = 64);

-- Full-text indexes.
create index jobs_fts_gin_idx on public.jobs using gin (fts);
create index candidates_fts_gin_idx on public.candidates using gin (fts);

-- Filter columns.
create index jobs_location_idx on public.jobs (location);
create index jobs_seniority_idx on public.jobs (seniority);
create index candidates_location_idx on public.candidates (location);
create index candidates_seniority_idx on public.candidates (seniority);

-- Foreign keys (the unique constraints already cover candidate_chunks.candidate_id
-- and match_explanations.job_id as leading columns).
create index match_explanations_candidate_id_idx on public.match_explanations (candidate_id);

-- Listing order.
create index jobs_created_at_idx on public.jobs (created_at desc);
create index candidates_created_at_idx on public.candidates (created_at desc);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------

create trigger jobs_set_updated_at before update on public.jobs
  for each row execute function public.tm_set_updated_at();
create trigger candidates_set_updated_at before update on public.candidates
  for each row execute function public.tm_set_updated_at();
create trigger candidate_chunks_set_updated_at before update on public.candidate_chunks
  for each row execute function public.tm_set_updated_at();
create trigger match_explanations_set_updated_at before update on public.match_explanations
  for each row execute function public.tm_set_updated_at();
