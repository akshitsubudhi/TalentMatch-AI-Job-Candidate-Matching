-- LOCAL DEVELOPMENT / CI ONLY. Do NOT run this against a Supabase project:
-- Supabase already provides these roles.
--
-- Recreates the subset of Supabase's role model the migrations depend on, so the
-- same migrations (and RLS policies) can be tested on a plain pgvector Postgres.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then
    -- PostgREST connects as authenticator and switches to the JWT's role.
    create role authenticator login noinherit password 'authenticator-local-dev-only';
  end if;
end
$$;

grant anon, authenticated, service_role to authenticator;
grant usage on schema public to anon, authenticated, service_role;
create schema if not exists extensions;
grant usage on schema extensions to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on functions to service_role;

-- Supabase puts the `extensions` schema on the search_path.
do $$
begin
  execute format('alter database %I set search_path = "$user", public, extensions', current_database());
end
$$;
