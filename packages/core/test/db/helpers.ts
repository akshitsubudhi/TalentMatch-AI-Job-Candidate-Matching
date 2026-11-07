import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { applyMigrations } from "../../src/db/migrate";

const here = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(here, "../../../..");

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

/**
 * Creates a throwaway database, applies the real migrations and returns a pool.
 * Requires TEST_DATABASE_URL pointing at a pgvector Postgres where the user can CREATE DATABASE.
 */
export async function createTestDatabase(): Promise<{ pool: pg.Pool; drop: () => Promise<void> }> {
  if (!TEST_DATABASE_URL) throw new Error("TEST_DATABASE_URL is not set");
  const admin = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 1 });
  const name = `tm_test_${process.pid}_${Date.now()}`;
  await admin.query(`create database ${name}`);
  const url = new URL(TEST_DATABASE_URL);
  url.pathname = `/${name}`;
  const pool = new pg.Pool({ connectionString: url.toString(), max: 5 });
  await applyMigrations(pool, {
    migrationsDir: path.join(repoRoot, "supabase/migrations"),
    localRolesFile: path.join(repoRoot, "supabase/local/00_supabase_roles.sql"),
  });
  // search_path set by the roles bootstrap applies to new sessions only.
  await pool.end();
  const fresh = new pg.Pool({ connectionString: url.toString(), max: 5 });
  return {
    pool: fresh,
    drop: async () => {
      await fresh.end();
      await admin.query(`drop database if exists ${name} with (force)`);
      await admin.end();
    },
  };
}
