import { PDFDocument, StandardFonts } from "pdf-lib";
import { vi } from "vitest";
import { OpenAIEmbedder } from "@talentmatch/core/embeddings";
import { IngestionService, InMemoryIngestionRepository, type IngestionRepository } from "@talentmatch/core/ingest";
import { createApp } from "../src/app";
import { extractText } from "../src/extract";
import { createLogger } from "../src/logger";

/** A fake OpenAI client: deterministic 1536-d vectors, no network. */
export function mockOpenAIClient(options: { fail?: boolean } = {}) {
  const create = vi.fn(async ({ input }: { input: string[] }) => {
    if (options.fail) throw new Error("429 You exceeded your current quota");
    return {
      data: input.map((text, index) => ({
        index,
        embedding: Array.from({ length: 1536 }, (_, i) => Math.sin(text.length + i)),
      })),
    };
  });
  return { client: { embeddings: { create } }, create };
}

export function buildTestApp(
  options: { apiKey?: string; failEmbeddings?: boolean; repository?: IngestionRepository; maxUploadBytes?: number; rateLimitPerMinute?: number } = {},
) {
  const repository = options.repository ?? new InMemoryIngestionRepository();
  const openai = mockOpenAIClient({ fail: options.failEmbeddings });
  const ingestion = new IngestionService({
    repository,
    embedder: new OpenAIEmbedder({ client: openai.client as never }),
    extractText,
  });
  const app = createApp({
    ingestion,
    logger: createLogger({ silent: true }),
    apiKey: options.apiKey,
    maxUploadBytes: options.maxUploadBytes,
    rateLimitPerMinute: options.rateLimitPerMinute ?? 1000,
  });
  return { app, repository, openai };
}

export async function makePdf(lines: string[]): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  let page = doc.addPage([612, 792]);
  let y = 750;
  for (const line of lines) {
    if (y < 50) {
      page = doc.addPage([612, 792]);
      y = 750;
    }
    page.drawText(line, { x: 50, y, size: 11, font });
    y -= 16;
  }
  return Buffer.from(await doc.save());
}

export const RESUME_LINES = [
  "SYNTHETIC RESUME - generated for tests",
  "Senior Data Engineer",
  "Built batch pipelines with Airflow and Spark in Python.",
  "Operated Kafka streaming on AWS and modelled data in dbt + Snowflake.",
  "Mentored three junior engineers.",
];
