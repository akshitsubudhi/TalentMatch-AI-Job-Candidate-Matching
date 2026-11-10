import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

describe("loadConfig", () => {
  it("accepts .env.example as shipped (empty values mean unset)", () => {
    const env = parseEnv(readFileSync(path.join(root, ".env.example"), "utf8"));
    const config = loadConfig({ ...env, OPENAI_API_KEY: "sk-test" });
    expect(config.PORT).toBe(4000);
    expect(config.INGEST_API_KEY).toBeUndefined();
    expect(config.DATABASE_SSL).toBeUndefined();
  });

  it("accepts the offline provider without an OpenAI key", () => {
    const config = loadConfig({ DATABASE_URL: "postgres://u:p@localhost:5432/db", EMBEDDINGS_PROVIDER: "local-hash" });
    expect(config.EMBEDDINGS_PROVIDER).toBe("local-hash");
  });

  it("still requires an OpenAI key for the openai provider and an API key in production", () => {
    expect(() => loadConfig({ DATABASE_URL: "postgres://u:p@localhost:5432/db" })).toThrow(/OPENAI_API_KEY/);
    expect(() =>
      loadConfig({ DATABASE_URL: "postgres://u:p@localhost:5432/db", NODE_ENV: "production", EMBEDDINGS_PROVIDER: "local-hash" }),
    ).toThrow(/INGEST_API_KEY/);
  });
});
