import { NextResponse, type NextRequest } from "next/server";
import { ExplanationRequestSchema, validationError } from "@talentmatch/core";
import { explainMatch } from "@/lib/server/explanations";
import { errorResponse } from "@/lib/server/http";
import type { ExplanationResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const parsed = ExplanationRequestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw validationError(parsed.error);
    const { explanation, cached } = await explainMatch(parsed.data.jobId, parsed.data.candidateId);
    const body: ExplanationResponse = {
      data: {
        summary: explanation.summary,
        matched_skills: explanation.matched_skills,
        missing_skills: explanation.missing_skills,
        model: explanation.model,
        prompt_version: explanation.prompt_version,
        cached,
      },
    };
    return NextResponse.json(body);
  } catch (error) {
    return errorResponse(error);
  }
}
