import type { z } from "zod";

/** Every API error (Express and Next.js route handlers) uses this shape. */
export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
    details?: unknown;
    requestId?: string;
  };
}

export type ApiErrorCode =
  | "validation_error"
  | "unauthorized"
  | "not_found"
  | "payload_too_large"
  | "unsupported_media_type"
  | "unprocessable_content"
  | "rate_limited"
  | "upstream_error"
  | "internal_error";

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ApiErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function zodIssues(error: z.ZodError): { path: string; message: string }[] {
  return error.issues.map((issue) => ({
    path: issue.path.map(String).join("."),
    message: issue.message,
  }));
}

export function validationError(error: z.ZodError): AppError {
  return new AppError(400, "validation_error", "Request validation failed", zodIssues(error));
}

export function errorBody(code: ApiErrorCode, message: string, details?: unknown, requestId?: string): ApiErrorBody {
  return {
    error: {
      code,
      message,
      ...(details === undefined ? {} : { details }),
      ...(requestId === undefined ? {} : { requestId }),
    },
  };
}
