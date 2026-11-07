import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type pg from "pg";

export interface MigrateOptions {
  migrationsDir: string;
  /** Local/CI only: create Supabase-like roles first (never on a real Supabase project). */
  localRolesFile?: string;
  log?: (message: string) => void;
}

/**
 * Minimal forward-only migration runner. Each file runs in its own transaction and
 * is recorded (with a checksum) in tm_private.schema_migrations. Equivalent to
 * `supabase db push` for this repo, but works against any Postgres URL.
 */
export async function applyMigrations(pool: pg.Pool, options: MigrateOptions): Promise<string[]> {
  const log = options.log ?? (() => undefined);
  const client = await pool.connect();
  const applied: string[] = [];
  try {
    if (options.localRolesFile) {
      await client.query(await readFile(options.localRolesFile, "utf8"));
      log(`bootstrapped local roles from ${path.basename(options.localRolesFile)}`);
    }
    await client.query(`
      create schema if not exists tm_private;
      revoke all on schema tm_private from public;
      create table if not exists tm_private.schema_migrations (
        name text primary key,
        checksum text not null,
        applied_at timestamptz not null default now()
      );`);
    const done = new Map(
      (await client.query<{ name: string; checksum: string }>("select name, checksum from tm_private.schema_migrations")).rows.map(
        (r) => [r.name, r.checksum],
      ),
    );
    const files = (await readdir(options.migrationsDir)).filter((f) => f.endsWith(".sql")).sort();
    for (const file of files) {
      const sql = await readFile(path.join(options.migrationsDir, file), "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      const previous = done.get(file);
      if (previous) {
        if (previous !== checksum) {
          throw new Error(`migration ${file} was modified after being applied; add a new migration instead`);
        }
        continue;
      }
      await client.query("begin");
      try {
        await client.query(sql);
        await client.query("insert into tm_private.schema_migrations (name, checksum) values ($1, $2)", [file, checksum]);
        await client.query("commit");
      } catch (error) {
        await client.query("rollback");
        throw new Error(`migration ${file} failed: ${error instanceof Error ? error.message : String(error)}`, {
          cause: error,
        });
      }
      applied.push(file);
      log(`applied ${file}`);
    }
    return applied;
  } finally {
    client.release();
  }
}
