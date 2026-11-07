import { createPool, PgIngestionRepository } from "@talentmatch/core/db";
import { createEmbedder } from "@talentmatch/core/embeddings";
import { IngestionService } from "@talentmatch/core/ingest";
import { createApp } from "./app";
import { loadConfig } from "./config";
import { extractText } from "./extract";
import { createLogger } from "./logger";

const config = loadConfig();
const logger = createLogger();
const pool = createPool(config);
pool.on("error", (err) => logger.error("idle pg client error", { message: err.message }));

const embedder = createEmbedder(config);
const ingestion = new IngestionService({ repository: new PgIngestionRepository(pool), embedder, extractText });

const app = createApp({
  ingestion,
  logger,
  apiKey: config.INGEST_API_KEY,
  maxUploadBytes: config.MAX_UPLOAD_BYTES,
  rateLimitPerMinute: config.RATE_LIMIT_PER_MINUTE,
  trustProxy: config.TRUST_PROXY,
  checkReady: async () => {
    await pool.query("select 1");
    return true;
  },
});

const server = app.listen(config.PORT, () => {
  logger.info("ingestion API listening", { port: config.PORT, embeddingModel: embedder.model, auth: Boolean(config.INGEST_API_KEY) });
  if (!config.INGEST_API_KEY) logger.warn("INGEST_API_KEY is not set: /v1 routes are unauthenticated (development only)");
});

function shutdown(signal: string) {
  logger.info("shutting down", { signal });
  server.close(() => {
    pool.end().finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
