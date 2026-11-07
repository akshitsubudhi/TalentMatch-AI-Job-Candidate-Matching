import request from "supertest";
import { describe, expect, it } from "vitest";
import { type InMemoryIngestionRepository } from "@talentmatch/core/ingest";
import { buildTestApp, makePdf, RESUME_LINES } from "./helpers";

const job = {
  title: "Senior Data Engineer",
  description: "Own data pipelines built with Airflow, Spark and Kafka on AWS.",
  location: "Berlin",
  seniority: "senior",
  skills: ["Airflow", "spark", "Kafka"],
};

const fields = { fullName: "Synthetic Tester", location: "Berlin", seniority: "senior", headline: "Data engineer", skills: "python, airflow" };

function uploadResume(app: Parameters<typeof request>[0], file: Buffer, filename: string, contentType: string, f = fields) {
  let req = request(app).post("/v1/candidates");
  for (const [k, v] of Object.entries(f)) req = req.field(k, v);
  return req.attach("file", file, { filename, contentType });
}

describe("health and errors", () => {
  it("GET /health", async () => {
    const { app } = buildTestApp();
    const res = await request(app).get("/health").expect(200);
    expect(res.body).toEqual({ status: "ok" });
    expect(res.headers["x-request-id"]).toBeTruthy();
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  it("unknown routes return the standard error shape", async () => {
    const { app } = buildTestApp();
    const res = await request(app).get("/nope").set("x-request-id", "test-request-1234").expect(404);
    expect(res.body).toEqual({ error: { code: "not_found", message: "No route for GET /nope", requestId: "test-request-1234" } });
  });
});

describe("auth", () => {
  it("rejects missing and wrong API keys when one is configured", async () => {
    const { app } = buildTestApp({ apiKey: "a-very-secret-key-123" });
    const missing = await request(app).post("/v1/jobs").send(job).expect(401);
    expect(missing.body.error.code).toBe("unauthorized");
    await request(app).post("/v1/jobs").set("x-api-key", "wrong").send(job).expect(401);
    await request(app).post("/v1/jobs").set("x-api-key", "a-very-secret-key-123").send(job).expect(201);
  });

  it("health stays public", async () => {
    const { app } = buildTestApp({ apiKey: "a-very-secret-key-123" });
    await request(app).get("/health").expect(200);
  });
});

describe("POST /v1/jobs", () => {
  it("creates a job, normalises skills and embeds it once", async () => {
    const { app, repository, openai } = buildTestApp();
    const res = await request(app).post("/v1/jobs").send(job).expect(201);
    expect(res.body.data).toMatchObject({ duplicate: false });
    const repo = repository as InMemoryIngestionRepository;
    const stored = repo.jobs.get(res.body.data.id)!;
    expect(stored.skills).toEqual(["Airflow", "Apache Spark", "Kafka"]);
    expect(stored.embedding).toHaveLength(1536);
    expect(stored.embeddingModel).toBe("text-embedding-3-small");
    expect(openai.create).toHaveBeenCalledTimes(1);
  });

  it("is idempotent", async () => {
    const { app, repository, openai } = buildTestApp();
    const a = await request(app).post("/v1/jobs").send(job).expect(201);
    const b = await request(app).post("/v1/jobs").send(job).expect(200);
    expect(b.body.data).toEqual({ id: a.body.data.id, duplicate: true });
    expect((repository as InMemoryIngestionRepository).jobs.size).toBe(1);
    expect(openai.create).toHaveBeenCalledTimes(1);
  });

  it("returns 400 with field-level details for invalid input", async () => {
    const { app } = buildTestApp();
    const res = await request(app).post("/v1/jobs").send({ ...job, seniority: "wizard", title: "" }).expect(400);
    expect(res.body.error.code).toBe("validation_error");
    expect(res.body.error.details.map((d: { path: string }) => d.path).sort()).toEqual(["seniority", "title"]);
  });

  it("returns 400 for malformed JSON and 413 for oversized bodies", async () => {
    const { app } = buildTestApp();
    const bad = await request(app).post("/v1/jobs").set("content-type", "application/json").send("{oops").expect(400);
    expect(bad.body.error.code).toBe("validation_error");
    const big = await request(app).post("/v1/jobs").send({ ...job, description: "x".repeat(200_000) }).expect(413);
    expect(big.body.error.code).toBe("payload_too_large");
  });

  it("returns 502 when the embedding provider fails (no row written)", async () => {
    const { app, repository } = buildTestApp({ failEmbeddings: true });
    const res = await request(app).post("/v1/jobs").send(job).expect(502);
    expect(res.body.error.code).toBe("upstream_error");
    expect((repository as InMemoryIngestionRepository).jobs.size).toBe(0);
  });
});

describe("POST /v1/candidates", () => {
  it("ingests a PDF resume: parses text, extracts skills, embeds chunks", async () => {
    const { app, repository } = buildTestApp();
    const pdf = await makePdf(RESUME_LINES);
    const res = await uploadResume(app, pdf, "resume.pdf", "application/pdf").expect(201);
    expect(res.body.data).toMatchObject({ duplicate: false, chunkCount: 1 });
    const stored = (repository as InMemoryIngestionRepository).candidates.get(res.body.data.id)!;
    expect(stored.resumeText).toContain("Built batch pipelines with Airflow and Spark in Python.");
    expect(stored.sourceMime).toBe("application/pdf");
    expect(stored.skills).toEqual(expect.arrayContaining(["Python", "Airflow", "Apache Spark", "Kafka", "AWS", "dbt", "Snowflake"]));
  });

  it("chunks long multi-page PDFs", async () => {
    const { app, repository } = buildTestApp();
    const lines = Array.from({ length: 150 }, (_, i) => `Project ${i}: shipped a Python service with PostgreSQL and Redis caching.`);
    const res = await uploadResume(app, await makePdf(lines), "long.pdf", "application/pdf").expect(201);
    expect(res.body.data.chunkCount).toBeGreaterThan(5);
    const stored = (repository as InMemoryIngestionRepository).candidates.get(res.body.data.id)!;
    expect(stored.chunks).toHaveLength(res.body.data.chunkCount);
  });

  it("is idempotent on file content (same bytes, different filename)", async () => {
    const { app, repository, openai } = buildTestApp();
    const pdf = await makePdf(RESUME_LINES);
    const a = await uploadResume(app, pdf, "a.pdf", "application/pdf").expect(201);
    const calls = openai.create.mock.calls.length;
    const b = await uploadResume(app, pdf, "b.pdf", "application/pdf").expect(200);
    expect(b.body.data).toEqual({ id: a.body.data.id, duplicate: true });
    expect((repository as InMemoryIngestionRepository).candidates.size).toBe(1);
    expect(openai.create.mock.calls.length).toBe(calls);
  });

  it("accepts plain text, including octet-stream with a .txt name", async () => {
    const { app } = buildTestApp();
    const text = Buffer.from(RESUME_LINES.join("\n"));
    await uploadResume(app, text, "cv.txt", "text/plain").expect(201);
    await uploadResume(app, Buffer.concat([text, Buffer.from("\nextra line")]), "cv.txt", "application/octet-stream").expect(201);
  });

  it("rejects a non-PDF disguised as PDF with 422", async () => {
    const { app } = buildTestApp();
    const res = await uploadResume(app, Buffer.from("just text pretending"), "fake.pdf", "application/pdf").expect(422);
    expect(res.body.error.code).toBe("unprocessable_content");
  });

  it("rejects a PDF with no extractable text (e.g. scanned) with 422", async () => {
    const { app } = buildTestApp();
    const res = await uploadResume(app, await makePdf([]), "empty.pdf", "application/pdf").expect(422);
    expect(res.body.error.message).toMatch(/too short/);
  });

  it("rejects invalid UTF-8 text with 422", async () => {
    const { app } = buildTestApp();
    await uploadResume(app, Buffer.from([0xff, 0xfe, 0xfd, 0x41]), "bad.txt", "text/plain").expect(422);
  });

  it("rejects unsupported file types with 415", async () => {
    const { app } = buildTestApp();
    const res = await uploadResume(app, Buffer.from([0x89, 0x50, 0x4e, 0x47]), "photo.png", "image/png").expect(415);
    expect(res.body.error.code).toBe("unsupported_media_type");
  });

  it("requires a file and valid fields", async () => {
    const { app } = buildTestApp();
    const noFile = await request(app).post("/v1/candidates").field("fullName", "x").expect(400);
    expect(noFile.body.error.message).toMatch(/file/);
    const badFields = await uploadResume(app, Buffer.from(RESUME_LINES.join("\n")), "cv.txt", "text/plain", {
      ...fields,
      seniority: "overlord",
    }).expect(400);
    expect(badFields.body.error.details[0].path).toBe("seniority");
  });

  it("rejects files over the size limit with 413", async () => {
    const { app } = buildTestApp({ maxUploadBytes: 2048 });
    const res = await uploadResume(app, Buffer.alloc(4096, 0x61), "big.txt", "text/plain").expect(413);
    expect(res.body.error.code).toBe("payload_too_large");
  });
});

describe("rate limiting", () => {
  it("returns 429 with the standard error shape", async () => {
    const { app } = buildTestApp({ rateLimitPerMinute: 2 });
    await request(app).post("/v1/jobs").send(job);
    await request(app).post("/v1/jobs").send(job);
    const res = await request(app).post("/v1/jobs").send(job).expect(429);
    expect(res.body.error.code).toBe("rate_limited");
  });
});
