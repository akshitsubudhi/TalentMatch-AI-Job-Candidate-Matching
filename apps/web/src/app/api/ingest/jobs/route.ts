import { NextResponse, type NextRequest } from "next/server";
import { AppError, JobCreateInputSchema, validationError } from "@talentmatch/core";
import { errorResponse } from "@/lib/server/http";
import { forwardToIngestApi } from "@/lib/server/ingest-proxy";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const json = await request.json().catch(() => {
      throw new AppError(400, "validation_error", "Malformed JSON body");
    });
    const parsed = JobCreateInputSchema.safeParse(json);
    if (!parsed.success) throw validationError(parsed.error);
    const result = await forwardToIngestApi("/v1/jobs", { body: JSON.stringify(parsed.data), json: true });
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    return errorResponse(error);
  }
}
