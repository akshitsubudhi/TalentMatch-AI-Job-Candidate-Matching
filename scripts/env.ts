import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Load .env from the repo root (Node >= 20.12 built-in), without overriding real env vars. */
export function loadDotEnv(): void {
  const file = path.join(repoRoot, ".env");
  if (existsSync(file)) process.loadEnvFile(file);
  // `.env.example`-style empty values (FOO=) mean "unset".
  for (const [key, value] of Object.entries(process.env)) if (value !== undefined && value.trim() === "") delete process.env[key];
}

export function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

export function option(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((a) => a.startsWith(prefix))?.slice(prefix.length);
}
