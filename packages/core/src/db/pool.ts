import { readFileSync } from "node:fs";
import pg from "pg";

export interface PoolEnv {
  DATABASE_URL?: string | undefined;
  /** "disable" | "no-verify" | "verify" (default: disable for localhost, verify otherwise). */
  DATABASE_SSL?: string | undefined;
  /** Optional path to a CA certificate (e.g. Supabase's prod-ca-2021.crt) used with "verify". */
  DATABASE_CA_CERT?: string | undefined;
  DATABASE_POOL_MAX?: string | undefined;
}

export function createPool(env: PoolEnv): pg.Pool {
  if (!env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const url = new URL(env.DATABASE_URL);
  const isLocal = ["localhost", "127.0.0.1", "::1", "db", "postgres"].includes(url.hostname);
  const mode = env.DATABASE_SSL || (isLocal ? "disable" : "verify");
  // sslmode in the URL would override our explicit config; strip it.
  url.searchParams.delete("sslmode");

  let ssl: pg.PoolConfig["ssl"];
  if (mode === "disable") ssl = false;
  else if (mode === "no-verify") ssl = { rejectUnauthorized: false };
  else if (mode === "verify")
    ssl = env.DATABASE_CA_CERT ? { ca: readFileSync(env.DATABASE_CA_CERT, "utf8") } : { rejectUnauthorized: true };
  else throw new Error(`Invalid DATABASE_SSL "${mode}"`);

  return new pg.Pool({
    connectionString: url.toString(),
    ssl,
    max: Number(env.DATABASE_POOL_MAX || 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
}
