import "server-only";
import { NextResponse } from "next/server";
import { AppError, errorBody } from "@talentmatch/core";

/** Map any thrown error to the shared `{ error: { code, message } }` JSON shape. */
export function errorResponse(error: unknown): NextResponse {
  if (error instanceof AppError) {
    return NextResponse.json(errorBody(error.code, error.message, error.details), { status: error.status });
  }
  if (error instanceof Error && error.name === "ExplanationError") {
    console.error("[explanations]", error.message);
    return NextResponse.json(errorBody("upstream_error", "The language model did not return a usable explanation"), { status: 502 });
  }
  console.error("[api] unexpected error", error);
  return NextResponse.json(errorBody("internal_error", "Internal server error"), { status: 500 });
}
