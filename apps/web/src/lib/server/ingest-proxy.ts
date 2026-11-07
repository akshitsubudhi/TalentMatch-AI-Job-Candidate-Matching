import "server-only";
import { AppError, type ApiErrorBody } from "@talentmatch/core";
import { serverEnv } from "./env";

export interface IngestResult {
  status: number;
  body: unknown;
}

/**
 * Forward an already-validated request to the Express ingestion API. The shared
 * INGEST_API_KEY is added here, on the server, so it never reaches the browser.
 */
export async function forwardToIngestApi(path: "/v1/jobs" | "/v1/candidates", init: { body: BodyInit; json?: boolean }): Promise<IngestResult> {
  const env = serverEnv();
  const headers: Record<string, string> = {};
  if (env.INGEST_API_KEY) headers["x-api-key"] = env.INGEST_API_KEY;
  if (init.json) headers["content-type"] = "application/json";

  let response: Response;
  try {
    response = await fetch(new URL(path, env.INGEST_API_URL), {
      method: "POST",
      headers,
      body: init.body,
      cache: "no-store",
      signal: AbortSignal.timeout(60_000),
    });
  } catch (cause) {
    throw new AppError(502, "upstream_error", "The ingestion API is unreachable. Is it running? (INGEST_API_URL)", {
      reason: cause instanceof Error ? cause.message : String(cause),
    });
  }
  const body = (await response.json().catch(() => null)) as unknown;
  if (body === null) throw new AppError(502, "upstream_error", `Ingestion API returned a non-JSON response (${response.status})`);
  if (response.status === 401) {
    // A key mismatch is a server misconfiguration, not the user's fault.
    throw new AppError(502, "upstream_error", "The web server's INGEST_API_KEY was rejected by the ingestion API");
  }
  return { status: response.status, body: body as ApiErrorBody | object };
}
