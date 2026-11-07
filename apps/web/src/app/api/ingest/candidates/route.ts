import { NextResponse, type NextRequest } from "next/server";
import { AppError, CandidateUploadFieldsSchema, validationError } from "@talentmatch/core";
import { errorResponse } from "@/lib/server/http";
import { forwardToIngestApi } from "@/lib/server/ingest-proxy";

export const runtime = "nodejs";

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set(["application/pdf", "text/plain"]);

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData().catch(() => {
      throw new AppError(400, "validation_error", "Expected multipart/form-data");
    });
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) throw new AppError(400, "validation_error", "Please choose a resume file");
    if (file.size > MAX_UPLOAD_BYTES) throw new AppError(413, "payload_too_large", "Resume must be 5 MB or smaller");
    const name = file.name.toLowerCase();
    if (!ALLOWED.has(file.type) && !name.endsWith(".pdf") && !name.endsWith(".txt")) {
      throw new AppError(415, "unsupported_media_type", "Only PDF and .txt resumes are supported");
    }
    const parsed = CandidateUploadFieldsSchema.safeParse({
      fullName: form.get("fullName"),
      location: form.get("location"),
      seniority: form.get("seniority"),
      headline: form.get("headline") ?? "",
      skills: form.get("skills") ?? "",
    });
    if (!parsed.success) throw validationError(parsed.error);

    const outgoing = new FormData();
    outgoing.set("fullName", parsed.data.fullName);
    outgoing.set("location", parsed.data.location);
    outgoing.set("seniority", parsed.data.seniority);
    outgoing.set("headline", parsed.data.headline);
    outgoing.set("skills", parsed.data.skills.join(", "));
    outgoing.set("file", file, file.name);
    const result = await forwardToIngestApi("/v1/candidates", { body: outgoing });
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    return errorResponse(error);
  }
}
