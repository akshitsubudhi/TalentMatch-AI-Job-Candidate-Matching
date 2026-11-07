-- Hybrid search RPCs: Postgres full-text search + pgvector cosine similarity,
-- fused with weighted Reciprocal Rank Fusion (RRF):
--
--   rrf_score(d) = w_keyword / (k + rank_keyword(d)) + w_semantic / (k + rank_semantic(d))
--
-- A document missing from one list contributes 0 for that list.
-- Filters (location, seniority) are applied inside BOTH retrieval CTEs, i.e. before
-- ranking, so filtered-out rows can never take a rank slot.
-- Setting a weight to 0 skips that retriever entirely (the `p_*_weight > 0` predicate
-- is a parameter-only qual, which Postgres turns into a one-time filter), which is how
-- the benchmark measures keyword-only and vector-only modes with the same code path.
--
-- Two choices below came from profiling at 20k resumes / 34.5k chunks (see BENCHMARK.md):
--  * plan_cache_mode = force_custom_plan: after 5 calls PL/pgSQL may switch to a generic
--    plan that cannot see LIMIT/filter values and picks a full scan + sort instead of the
--    HNSW index (measured: vector-only p50 154 ms generic vs 12.5 ms custom).
--  * ts_rank instead of ts_rank_cd: cover density rewards query terms appearing close
--    together, which is meaningless for an OR-list of skills, and it dominated keyword
--    latency (p50 323 ms vs 80 ms).

-- Build an OR-tsquery from the lexemes of a title + skills list.
-- Lexemes come out of the 'english' parser already stemmed, so we feed them back
-- through the 'simple' config to avoid stemming twice.
create or replace function public.tm_keyword_query(p_title text, p_skills text[])
returns tsquery
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
           when count(*) = 0 then null
           else pg_catalog.to_tsquery('simple', pg_catalog.string_agg(q, ' | '))
         end
  from (
    select distinct
      '''' || pg_catalog.replace(pg_catalog.replace(lexeme, '\', ''), '''', '''''') || '''' as q
    from pg_catalog.unnest(
      pg_catalog.tsvector_to_array(
        pg_catalog.to_tsvector('english'::regconfig,
          coalesce(p_title, '') || ' ' || public.tm_join_text(p_skills))
      )
    ) as lexeme
  ) terms
$$;

create or replace function public.tm_validate_search_args(
  p_match_count integer,
  p_keyword_weight double precision,
  p_semantic_weight double precision,
  p_rrf_k integer,
  p_pool_size integer
)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_match_count is null or p_match_count < 1 or p_match_count > 100 then
    raise exception using errcode = '22023', message = 'p_match_count must be between 1 and 100';
  end if;
  if p_keyword_weight is null or p_semantic_weight is null
     or p_keyword_weight < 0 or p_semantic_weight < 0
     or p_keyword_weight > 10 or p_semantic_weight > 10 then
    raise exception using errcode = '22023', message = 'weights must be between 0 and 10';
  end if;
  if p_keyword_weight = 0 and p_semantic_weight = 0 then
    raise exception using errcode = '22023', message = 'at least one weight must be > 0';
  end if;
  if p_rrf_k is null or p_rrf_k < 1 or p_rrf_k > 1000 then
    raise exception using errcode = '22023', message = 'p_rrf_k must be between 1 and 1000';
  end if;
  if p_pool_size is null or p_pool_size < p_match_count or p_pool_size > 1000 then
    raise exception using errcode = '22023', message = 'p_pool_size must be between p_match_count and 1000';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Job -> ranked candidates
-- ---------------------------------------------------------------------------
create or replace function public.match_candidates_for_job(
  p_job_id          uuid,
  p_match_count     integer          default 10,
  p_location        text             default null,
  p_seniority       text             default null,
  p_keyword_weight  double precision default 1.0,
  p_semantic_weight double precision default 1.0,
  p_rrf_k           integer          default 60,
  p_pool_size       integer          default 100
)
returns table (
  candidate_id        uuid,
  full_name           text,
  headline            text,
  location            text,
  seniority           text,
  skills              text[],
  is_synthetic        boolean,
  keyword_rank        integer,
  semantic_rank       integer,
  keyword_score       real,
  semantic_similarity double precision,
  rrf_score           double precision
)
language plpgsql
stable
set search_path = public, extensions, pg_catalog
set hnsw.iterative_scan = 'relaxed_order'
set hnsw.ef_search = 100
set plan_cache_mode = 'force_custom_plan'
as $$
#variable_conflict use_column
declare
  v_embedding extensions.vector(1536);
  v_query     tsquery;
begin
  perform public.tm_validate_search_args(p_match_count, p_keyword_weight, p_semantic_weight, p_rrf_k, p_pool_size);

  select j.embedding, public.tm_keyword_query(j.title, j.skills)
    into v_embedding, v_query
    from public.jobs j
   where j.id = p_job_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'job not found';
  end if;

  return query
  with keyword_hits as (
    select c.id, ts_rank(c.fts, v_query, 1) as score
      from public.candidates c
     where p_keyword_weight > 0
       and v_query is not null
       and c.fts @@ v_query
       and (p_location is null or c.location = p_location)
       and (p_seniority is null or c.seniority = p_seniority)
     order by score desc, c.id
     limit p_pool_size
  ),
  keyword_ranked as (
    select id, score, (row_number() over (order by score desc, id))::integer as rnk
      from keyword_hits
  ),
  semantic_chunks as (
    -- ANN over chunks; a candidate's distance is its best (closest) chunk.
    select cc.candidate_id as id, (cc.embedding <=> v_embedding) as distance
      from public.candidate_chunks cc
      join public.candidates c on c.id = cc.candidate_id
     where p_semantic_weight > 0
       and (p_location is null or c.location = p_location)
       and (p_seniority is null or c.seniority = p_seniority)
     order by cc.embedding <=> v_embedding
     limit p_pool_size * 3
  ),
  semantic_ranked as (
    select id, distance, rnk from (
      select id, min(distance) as distance,
             (row_number() over (order by min(distance), id))::integer as rnk
        from semantic_chunks
       group by id
    ) s
     where rnk <= p_pool_size
  ),
  fused as (
    select coalesce(k.id, s.id) as id,
           k.rnk as k_rnk, s.rnk as s_rnk, k.score as k_score, s.distance as s_distance,
           coalesce(p_keyword_weight / (p_rrf_k + k.rnk), 0)
         + coalesce(p_semantic_weight / (p_rrf_k + s.rnk), 0) as rrf
      from keyword_ranked k
      full outer join semantic_ranked s on s.id = k.id
  )
  select c.id, c.full_name, c.headline, c.location, c.seniority, c.skills, c.is_synthetic,
         f.k_rnk, f.s_rnk, f.k_score, (1 - f.s_distance)::double precision, f.rrf
    from fused f
    join public.candidates c on c.id = f.id
   order by f.rrf desc, c.id
   limit p_match_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Candidate -> ranked jobs
-- ---------------------------------------------------------------------------
create or replace function public.match_jobs_for_candidate(
  p_candidate_id    uuid,
  p_match_count     integer          default 10,
  p_location        text             default null,
  p_seniority       text             default null,
  p_keyword_weight  double precision default 1.0,
  p_semantic_weight double precision default 1.0,
  p_rrf_k           integer          default 60,
  p_pool_size       integer          default 100
)
returns table (
  job_id              uuid,
  title               text,
  location            text,
  seniority           text,
  skills              text[],
  is_synthetic        boolean,
  keyword_rank        integer,
  semantic_rank       integer,
  keyword_score       real,
  semantic_similarity double precision,
  rrf_score           double precision
)
language plpgsql
stable
set search_path = public, extensions, pg_catalog
set hnsw.iterative_scan = 'relaxed_order'
set hnsw.ef_search = 100
set plan_cache_mode = 'force_custom_plan'
as $$
#variable_conflict use_column
declare
  v_query tsquery;
begin
  perform public.tm_validate_search_args(p_match_count, p_keyword_weight, p_semantic_weight, p_rrf_k, p_pool_size);

  select public.tm_keyword_query(c.headline, c.skills)
    into v_query
    from public.candidates c
   where c.id = p_candidate_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'candidate not found';
  end if;

  return query
  with keyword_hits as (
    select j.id, ts_rank(j.fts, v_query, 1) as score
      from public.jobs j
     where p_keyword_weight > 0
       and v_query is not null
       and j.fts @@ v_query
       and (p_location is null or j.location = p_location)
       and (p_seniority is null or j.seniority = p_seniority)
     order by score desc, j.id
     limit p_pool_size
  ),
  keyword_ranked as (
    select id, score, (row_number() over (order by score desc, id))::integer as rnk
      from keyword_hits
  ),
  semantic_hits as (
    -- One ANN query per resume chunk; a job's distance is its closest chunk.
    select x.id, x.distance
      from public.candidate_chunks cc
     cross join lateral (
       select j.id, (j.embedding <=> cc.embedding) as distance
         from public.jobs j
        where (p_location is null or j.location = p_location)
          and (p_seniority is null or j.seniority = p_seniority)
        order by j.embedding <=> cc.embedding
        limit p_pool_size
     ) x
     where p_semantic_weight > 0
       and cc.candidate_id = p_candidate_id
  ),
  semantic_ranked as (
    select id, distance, rnk from (
      select id, min(distance) as distance,
             (row_number() over (order by min(distance), id))::integer as rnk
        from semantic_hits
       group by id
    ) s
     where rnk <= p_pool_size
  ),
  fused as (
    select coalesce(k.id, s.id) as id,
           k.rnk as k_rnk, s.rnk as s_rnk, k.score as k_score, s.distance as s_distance,
           coalesce(p_keyword_weight / (p_rrf_k + k.rnk), 0)
         + coalesce(p_semantic_weight / (p_rrf_k + s.rnk), 0) as rrf
      from keyword_ranked k
      full outer join semantic_ranked s on s.id = k.id
  )
  select j.id, j.title, j.location, j.seniority, j.skills, j.is_synthetic,
         f.k_rnk, f.s_rnk, f.k_score, (1 - f.s_distance)::double precision, f.rrf
    from fused f
    join public.jobs j on j.id = f.id
   order by f.rrf desc, j.id
   limit p_match_count;
end;
$$;

-- Matching reads resume data, so only server-side callers may execute it.
revoke all on function public.match_candidates_for_job(uuid, integer, text, text, double precision, double precision, integer, integer) from public, anon, authenticated;
revoke all on function public.match_jobs_for_candidate(uuid, integer, text, text, double precision, double precision, integer, integer) from public, anon, authenticated;
grant execute on function public.match_candidates_for_job(uuid, integer, text, text, double precision, double precision, integer, integer) to service_role;
grant execute on function public.match_jobs_for_candidate(uuid, integer, text, text, double precision, double precision, integer, integer) to service_role;
