import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createEmbedder, OpenAIEmbedder } from "../src/embeddings";
import { createExplainer, OpenAIExplainer } from "../src/explain";
import { withoutEmptyStrings } from "../src/env";

const cosine = (a: number[], b: number[]) => {
  const dot = a.reduce((s, v, i) => s + v * (b[i] as number), 0);
  const n = (v: number[]) => Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  return dot / (n(a) * n(b));
};

describe("OpenAI-compatible embedder options (Ollama)", () => {
  it("omits `dimensions` and zero-pads 768-d vectors without changing cosine similarity", async () => {
    const a = Array.from({ length: 768 }, (_, i) => Math.sin(i));
    const b = Array.from({ length: 768 }, (_, i) => Math.cos(i * 0.7));
    const create = vi.fn(async (_req: Record<string, unknown>) => ({ data: [{ index: 0, embedding: a }, { index: 1, embedding: b }] }));
    const e = new OpenAIEmbedder({ client: { embeddings: { create } } as never, model: "nomic-embed-text", label: "ollama/nomic-embed-text", requestDimensions: false, zeroPad: true });
    const [pa, pb] = await e.embed(["x", "y"]);
    expect(create.mock.calls[0]![0]).not.toHaveProperty("dimensions");
    expect(create.mock.calls[0]![0]).toMatchObject({ model: "nomic-embed-text" });
    expect(pa).toHaveLength(1536);
    expect(pa!.slice(768).every((v) => v === 0)).toBe(true);
    expect(cosine(pa!, pb!)).toBeCloseTo(cosine(a, b), 12);
    expect(e.model).toBe("ollama/nomic-embed-text");
  });

  it("rejects vectors wider than the schema", async () => {
    const create = vi.fn(async () => ({ data: [{ index: 0, embedding: new Array(4096).fill(0.1) }] }));
    const e = new OpenAIEmbedder({ client: { embeddings: { create } } as never, requestDimensions: false, zeroPad: true });
    await expect(e.embed(["x"])).rejects.toThrow(/wider than 1536/);
  });

  it("explainer sends max_tokens when configured for Ollama", async () => {
    const content = JSON.stringify({ summary: "Strong Python data background. Lacks Kafka experience.", matched_skills: ["Python"], missing_skills: ["Kafka"] });
    const create = vi.fn(async () => ({ choices: [{ message: { content, refusal: null } }] }));
    const ex = new OpenAIExplainer({ client: { chat: { completions: { create } } } as never, model: "llama3.1:8b", label: "ollama/llama3.1:8b", tokenLimitParam: "max_tokens" });
    await ex.explain({
      job: { title: "Data Engineer", description: "Pipelines in Python and Kafka.", location: "Remote", seniority: "mid", skills: ["Python", "Kafka"] },
      candidate: { headline: "", location: "Remote", seniority: "mid", skills: ["Python"], resumeExcerpt: "Python ETL." },
    });
    const req = (create.mock.calls[0] as unknown as [Record<string, unknown>])[0];
    expect(req.max_tokens).toBe(2000);
    expect(req).not.toHaveProperty("max_completion_tokens");
    expect(ex.model).toBe("ollama/llama3.1:8b");
  });

  it("treats empty env values as unset", () => {
    expect(withoutEmptyStrings({ A: "", B: " ", C: "x", D: undefined })).toEqual({ C: "x" });
    expect(createEmbedder({ EMBEDDINGS_PROVIDER: "", OPENAI_API_KEY: "sk-test" }).model).toBe("text-embedding-3-small");
  });
});

/** A fake server shaped like Ollama's OpenAI-compatible API, so the real SDK HTTP path is exercised. */
describe("Ollama provider against an Ollama-shaped HTTP server", () => {
  let server: Server;
  let baseURL = "";
  const seen: { path: string; body: Record<string, unknown>; auth?: string }[] = [];

  beforeAll(async () => {
    server = createServer((req, res) => {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        const body = JSON.parse(raw) as Record<string, unknown>;
        seen.push({ path: req.url ?? "", body, auth: req.headers.authorization });
        res.setHeader("content-type", "application/json");
        if (req.url === "/v1/embeddings") {
          const input = body.input as string[];
          res.end(JSON.stringify({ object: "list", model: body.model, data: input.map((t, index) => ({ object: "embedding", index, embedding: Array.from({ length: 768 }, (_, i) => Math.sin(t.length + i)) })) }));
        } else if (req.url === "/v1/chat/completions") {
          const content = JSON.stringify({ summary: "Solid Python ETL experience matches the role. Kafka streaming is not shown.", matched_skills: ["Python"], missing_skills: ["Kafka"] });
          res.end(JSON.stringify({ id: "x", object: "chat.completion", created: 0, model: body.model, choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content } }] }));
        } else {
          res.statusCode = 404;
          res.end("{}");
        }
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    baseURL = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  it("embeds via /v1/embeddings with the configured model", async () => {
    const e = createEmbedder({ EMBEDDINGS_PROVIDER: "ollama", OLLAMA_BASE_URL: baseURL, OLLAMA_EMBEDDING_MODEL: "nomic-embed-text" });
    const [v] = await e.embed(["hello"]);
    expect(v).toHaveLength(1536);
    const call = seen.find((s) => s.path === "/v1/embeddings")!;
    expect(call.body.model).toBe("nomic-embed-text");
    expect(call.body).not.toHaveProperty("dimensions");
    expect(call.auth).toBe("Bearer ollama");
  });

  it("explains via /v1/chat/completions with a JSON schema and validates the result", async () => {
    const ex = createExplainer({ EXPLANATIONS_PROVIDER: "ollama", OLLAMA_BASE_URL: baseURL, OLLAMA_CHAT_MODEL: "llama3.1:8b" });
    const out = await ex.explain({
      job: { title: "Data Engineer", description: "Pipelines in Python and Kafka.", location: "Remote", seniority: "mid", skills: ["Python", "Kafka"] },
      candidate: { headline: "", location: "Remote", seniority: "mid", skills: ["Python"], resumeExcerpt: "Python ETL." },
    });
    expect(out).toMatchObject({ matched_skills: ["Python"], missing_skills: ["Kafka"] });
    const call = seen.find((s) => s.path === "/v1/chat/completions")!;
    expect(call.body).toMatchObject({ model: "llama3.1:8b", max_tokens: 600, response_format: { type: "json_schema" } });
  });
});
