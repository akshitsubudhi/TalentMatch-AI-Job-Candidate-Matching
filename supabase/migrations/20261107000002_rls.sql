-- Row Level Security.
--
-- Access model (demo has no end-user auth yet):
--   * All writes go through server-side code using the service_role key or a
--     direct Postgres connection; both bypass RLS. Neither is ever sent to a browser.
--   * jobs:               public job posts, readable by anon/authenticated (no writes).
--   * candidates,
--     candidate_chunks,
--     match_explanations: contain resume data, so there are NO policies for anon or
--                         authenticated: RLS denies every row to them.
-- When recruiter auth is added, add e.g. `using (org_id = auth.jwt() ->> 'org_id')`
-- policies here instead of widening grants.

alter table public.jobs enable row level security;
alter table public.candidates enable row level security;
alter table public.candidate_chunks enable row level security;
alter table public.match_explanations enable row level security;

create policy "jobs are publicly readable"
  on public.jobs for select
  to anon, authenticated
  using (true);

-- Defence in depth: Supabase grants table privileges to anon/authenticated by
-- default. Remove everything we do not intend to expose.
revoke all on public.candidates, public.candidate_chunks, public.match_explanations from anon, authenticated;
revoke insert, update, delete, truncate on public.jobs from anon, authenticated;
grant select on public.jobs to anon, authenticated;

grant all on public.jobs, public.candidates, public.candidate_chunks, public.match_explanations to service_role;
