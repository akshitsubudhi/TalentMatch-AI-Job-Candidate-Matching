/**
 * Apply supabase/migrations/*.sql to DATABASE_URL.
 *
 *   pnpm db:migrate                 # Supabase (or any Postgres that already has Supabase roles)
 *   pnpm db:migrate --local-roles   # plain Postgres (docker compose --profile local): create anon/
 *                                   # authenticated/service_role first. NEVER use against Supabase.
 *
 * Alternative for Supabase users: `supabase link && supabase db push` (same files).
 */
import path from "node:path";
import { applyMigrations, createPool } from "@talentmatch/core/db";
import { flag, loadDotEnv, repoRoot } from "./env";

loadDotEnv();
const pool = createPool(process.env);
try {
  const applied = await applyMigrations(pool, {
    migrationsDir: path.join(repoRoot, "supabase/migrations"),
    ...(flag("local-roles") ? { localRolesFile: path.join(repoRoot, "supabase/local/00_supabase_roles.sql") } : {}),
    log: (m) => console.log(`[migrate] ${m}`),
  });
  console.log(applied.length ? `[migrate] done (${applied.length} applied)` : "[migrate] already up to date");
} finally {
  await pool.end();
}
