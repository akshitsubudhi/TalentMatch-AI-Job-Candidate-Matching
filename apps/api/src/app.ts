import express from "express";
import helmet from "helmet";
import multer from "multer";
import { rateLimit } from "express-rate-limit";
import {
  AppError,
  CandidateUploadFieldsSchema,
  errorBody,
  JobCreateInputSchema,
  validationError,
} from "@talentmatch/core";
import type { IngestionService, SourceMime } from "@talentmatch/core/ingest";
import type { Logger } from "./logger";
import { apiKeyAuth, errorHandler, notFound, requestId, requestLogger } from "./middleware";

export interface AppDeps {
  ingestion: IngestionService;
  logger: Logger;
  apiKey?: string | undefined;
  /** Returns true when the database is reachable. */
  checkReady?: () => Promise<boolean>;
  maxUploadBytes?: number;
  rateLimitPerMinute?: number;
  trustProxy?: number;
}

const ALLOWED_MIME: Record<string, SourceMime> = {
  "application/pdf": "application/pdf",
  "text/plain": "text/plain",
};

function resolveMime(file: Express.Multer.File): SourceMime | null {
  const declared = file.mimetype.split(";")[0]?.trim().toLowerCase() ?? "";
  if (ALLOWED_MIME[declared]) return ALLOWED_MIME[declared];
  // Some browsers send application/octet-stream; fall back to the extension.
  const name = file.originalname.toLowerCase();
  if (name.endsWith(".pdf")) return "application/pdf";
  if (name.endsWith(".txt")) return "text/plain";
  return null;
}

export function createApp(deps: AppDeps): express.Express {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", deps.trustProxy ?? 0);

  app.use(requestId);
  app.use(requestLogger(deps.logger));
  app.use(helmet());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });
  app.get("/health/ready", async (req, res) => {
    const ready = deps.checkReady ? await deps.checkReady().catch(() => false) : true;
    if (ready) res.json({ status: "ready" });
    else res.status(503).json(errorBody("upstream_error", "Database is not reachable", undefined, req.id));
  });

  const v1 = express.Router();
  v1.use(
    rateLimit({
      windowMs: 60_000,
      limit: deps.rateLimitPerMinute ?? 60,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      handler: (req, res) => {
        res.status(429).json(errorBody("rate_limited", "Too many requests, slow down", undefined, req.id));
      },
    }),
  );
  v1.use(apiKeyAuth(deps.apiKey));

  v1.post("/jobs", express.json({ limit: "100kb" }), async (req, res) => {
    const parsed = JobCreateInputSchema.safeParse(req.body);
    if (!parsed.success) throw validationError(parsed.error);
    const result = await deps.ingestion.ingestJob(parsed.data);
    res.status(result.duplicate ? 200 : 201).json({ data: { id: result.id, duplicate: result.duplicate } });
  });

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: deps.maxUploadBytes ?? 5 * 1024 * 1024, files: 1, fields: 10, fieldSize: 10_000 },
  });

  v1.post("/candidates", upload.single("file"), async (req, res) => {
    const file = req.file;
    if (!file) throw new AppError(400, "validation_error", 'Multipart field "file" is required');
    const mime = resolveMime(file);
    if (!mime) {
      throw new AppError(415, "unsupported_media_type", "Only PDF (.pdf) and plain-text (.txt) resumes are supported");
    }
    const parsed = CandidateUploadFieldsSchema.safeParse(req.body ?? {});
    if (!parsed.success) throw validationError(parsed.error);

    const result = await deps.ingestion.ingestResume({
      bytes: new Uint8Array(file.buffer.buffer, file.buffer.byteOffset, file.buffer.byteLength),
      mime,
      filename: file.originalname.slice(0, 255) || null,
      fields: parsed.data,
    });
    res.status(result.duplicate ? 200 : 201).json({
      data: { id: result.id, duplicate: result.duplicate, ...(result.chunkCount ? { chunkCount: result.chunkCount } : {}) },
    });
  });

  app.use("/v1", v1);
  app.use(notFound);
  app.use(errorHandler(deps.logger));
  return app;
}
