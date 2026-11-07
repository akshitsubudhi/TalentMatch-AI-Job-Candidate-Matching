import { randomUUID, timingSafeEqual } from "node:crypto";
import type { ErrorRequestHandler, RequestHandler } from "express";
import multer from "multer";
import { AppError, errorBody } from "@talentmatch/core";
import type { Logger } from "./logger";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Correlation id, echoed in the x-request-id header and in error bodies. */
      id: string;
    }
  }
}

export const requestId: RequestHandler = (req, res, next) => {
  const incoming = req.header("x-request-id");
  req.id = incoming && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID();
  res.setHeader("x-request-id", req.id);
  next();
};

export function requestLogger(logger: Logger): RequestHandler {
  return (req, res, next) => {
    const start = process.hrtime.bigint();
    res.on("finish", () => {
      logger.info("request", {
        requestId: req.id,
        method: req.method,
        path: req.path,
        status: res.statusCode,
        durationMs: Number(process.hrtime.bigint() - start) / 1e6,
      });
    });
    next();
  };
}

/** Requires `x-api-key` when an API key is configured (always in production). */
export function apiKeyAuth(apiKey: string | undefined): RequestHandler {
  const expected = apiKey ? Buffer.from(apiKey) : null;
  return (req, _res, next) => {
    if (!expected) return next();
    const provided = Buffer.from(req.header("x-api-key") ?? "");
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
      return next(new AppError(401, "unauthorized", "Missing or invalid x-api-key header"));
    }
    next();
  };
}

export const notFound: RequestHandler = (req, _res, next) => {
  next(new AppError(404, "not_found", `No route for ${req.method} ${req.path}`));
};

export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (err: unknown, req, res, _next) => {
    let appError: AppError;
    if (err instanceof AppError) {
      appError = err;
    } else if (err instanceof multer.MulterError) {
      appError =
        err.code === "LIMIT_FILE_SIZE"
          ? new AppError(413, "payload_too_large", "File is too large")
          : new AppError(400, "validation_error", `Upload error: ${err.message}`, { field: err.field });
    } else if (isBodyParserError(err)) {
      appError =
        err.type === "entity.too.large"
          ? new AppError(413, "payload_too_large", "Request body is too large")
          : new AppError(400, "validation_error", "Malformed JSON body");
    } else if (isEmbeddingError(err)) {
      appError = new AppError(502, "upstream_error", "Embedding provider request failed");
    } else {
      appError = new AppError(500, "internal_error", "Internal server error");
    }

    if (appError.status >= 500) {
      logger.error("request failed", {
        requestId: req.id,
        error: err instanceof Error ? { name: err.name, message: err.message, stack: err.stack } : String(err),
      });
    }
    res.status(appError.status).json(errorBody(appError.code, appError.message, appError.details, req.id));
  };
}

function isBodyParserError(err: unknown): err is { type: string } {
  return typeof err === "object" && err !== null && "type" in err && typeof (err as { type: unknown }).type === "string" &&
    String((err as { type: string }).type).startsWith("entity.");
}

function isEmbeddingError(err: unknown): boolean {
  return err instanceof Error && err.name === "EmbeddingError";
}
