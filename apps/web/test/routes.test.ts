import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Route handlers read validated env lazily; set it before importing them.
beforeAll(() => {
  Object.assign(process.env, {
    NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321",
    SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key-not-real",
    INGEST_API_URL: "http://ingest.test",
    INGEST_API_KEY: "test-ingest-key-1234567890",
    EXPLANATIONS_PROVIDER: "rules",
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const validJob = {
  title: "Senior Backend Engineer",
  description: "Build Node.js services on PostgreSQL for a payments product.",
  location: "Remote",
  seniority: "senior",
  skills: "node, postgres",
};

function jsonRequest(url: string, body: unknown) {
  return new NextRequest(url, { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body), headers: { "content-type": "application/json" } });
}

describe("POST /api/ingest/jobs", () => {
  it("validates input with zod and never calls the API for invalid bodies", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { POST } = await import("../src/app/api/ingest/jobs/route");
    const res = await POST(jsonRequest("http://localhost/api/ingest/jobs", { ...validJob, seniority: "wizard" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("validation_error");
    expect(body.error.details[0].path).toBe("seniority");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON", async () => {
    const { POST } = await import("../src/app/api/ingest/jobs/route");
    const res = await POST(jsonRequest("http://localhost/api/ingest/jobs", "{nope"));
    expect(res.status).toBe(400);
  });

  it("forwards normalised input with the server-side API key and relays the status", async () => {
    const fetchMock = vi.fn(async () => Response.json({ data: { id: "abc", duplicate: false } }, { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const { POST } = await import("../src/app/api/ingest/jobs/route");
    const res = await POST(jsonRequest("http://localhost/api/ingest/jobs", validJob));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ data: { id: "abc", duplicate: false } });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).toBe("http://ingest.test/v1/jobs");
    expect((init.headers as Record<string, string>)["x-api-key"]).toBe("test-ingest-key-1234567890");
    expect(JSON.parse(init.body as string).skills).toEqual(["Node.js", "PostgreSQL"]);
  });

  it("returns 502 when the ingestion API is unreachable or rejects the key", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    const { POST } = await import("../src/app/api/ingest/jobs/route");
    const down = await POST(jsonRequest("http://localhost/api/ingest/jobs", validJob));
    expect(down.status).toBe(502);
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: { code: "unauthorized", message: "x" } }, { status: 401 })));
    const rejected = await POST(jsonRequest("http://localhost/api/ingest/jobs", validJob));
    expect(rejected.status).toBe(502);
    expect((await rejected.json()).error.message).toMatch(/INGEST_API_KEY/);
  });
});

describe("POST /api/ingest/candidates", () => {
  function upload(fields: Record<string, string>, file?: File) {
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) form.set(k, v);
    if (file) form.set("file", file);
    return new NextRequest("http://localhost/api/ingest/candidates", { method: "POST", body: form });
  }
  const fields = { fullName: "Test Person", location: "Remote", seniority: "mid" };

  it("requires a file, valid fields and an allowed type", async () => {
    const { POST } = await import("../src/app/api/ingest/candidates/route");
    expect((await POST(upload(fields))).status).toBe(400);
    expect((await POST(upload({ ...fields, seniority: "boss" }, new File(["hello world resume"], "cv.txt", { type: "text/plain" })))).status).toBe(400);
    expect((await POST(upload(fields, new File([new Uint8Array([1, 2, 3])], "a.png", { type: "image/png" })))).status).toBe(415);
  });

  it("forwards valid multipart uploads", async () => {
    const fetchMock = vi.fn(async () => Response.json({ data: { id: "c1", duplicate: true } }, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { POST } = await import("../src/app/api/ingest/candidates/route");
    const res = await POST(upload({ ...fields, skills: "python" }, new File(["Python engineer resume text"], "cv.txt", { type: "text/plain" })));
    expect(res.status).toBe(200);
    const [, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    const sent = init.body as FormData;
    expect(sent.get("fullName")).toBe("Test Person");
    expect(sent.get("skills")).toBe("Python");
    expect((sent.get("file") as File).name).toBe("cv.txt");
  });
});

describe("POST /api/explanations", () => {
  it("rejects non-UUID ids before touching the database", async () => {
    const { POST } = await import("../src/app/api/explanations/route");
    const res = await POST(jsonRequest("http://localhost/api/explanations", { jobId: "1", candidateId: "2" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("validation_error");
  });
});
