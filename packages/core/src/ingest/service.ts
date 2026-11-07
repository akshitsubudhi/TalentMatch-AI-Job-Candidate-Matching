import type { Embedder } from "../embeddings/types";
import { AppError } from "../errors";
import type { CandidateUploadFields, JobCreateInput } from "../schemas";
import { extractSkills, normalizeSkills } from "../skills";
import { chunkText, type ChunkOptions } from "../text/chunk";
import { cleanText } from "../text/clean";
import { sha256Hex } from "./hash";
import type { IngestionRepository, SourceMime } from "./types";

export const MIN_RESUME_CHARS = 50;

export type TextExtractor = (bytes: Uint8Array, mime: SourceMime) => Promise<string>;

export interface IngestOutcome {
  id: string;
  duplicate: boolean;
  chunkCount?: number;
}

export interface IngestionServiceOptions {
  repository: IngestionRepository;
  embedder: Embedder;
  extractText: TextExtractor;
  chunkOptions?: ChunkOptions;
}

export class IngestionService {
  private readonly repo: IngestionRepository;
  private readonly embedder: Embedder;
  private readonly extractText: TextExtractor;
  private readonly chunkOptions: ChunkOptions;

  constructor(options: IngestionServiceOptions) {
    this.repo = options.repository;
    this.embedder = options.embedder;
    this.extractText = options.extractText;
    this.chunkOptions = options.chunkOptions ?? {};
  }

  /** Hash of the normalised job payload. Field order and skill order do not matter. */
  static jobContentHash(input: JobCreateInput): string {
    return sha256Hex(
      JSON.stringify({
        title: input.title.trim(),
        description: input.description.trim(),
        location: input.location.trim(),
        seniority: input.seniority,
        skills: [...input.skills].map((s) => s.toLowerCase()).sort(),
      }),
    );
  }

  static jobEmbeddingText(input: Pick<JobCreateInput, "title" | "seniority" | "skills" | "description">): string {
    return `${input.title}\nSeniority: ${input.seniority}\nSkills: ${input.skills.join(", ")}\n\n${input.description}`;
  }

  async ingestJob(input: JobCreateInput, options: { isSynthetic?: boolean } = {}): Promise<IngestOutcome> {
    const contentHash = IngestionService.jobContentHash(input);
    const existing = await this.repo.findJobIdByHash(contentHash);
    if (existing) return { id: existing, duplicate: true };

    const [embedding] = await this.embedder.embed([IngestionService.jobEmbeddingText(input)]);
    if (!embedding) throw new AppError(502, "upstream_error", "Embedding provider returned no vector");

    const result = await this.repo.insertJob({
      title: input.title,
      description: input.description,
      location: input.location,
      seniority: input.seniority,
      skills: input.skills,
      contentHash,
      embedding,
      embeddingModel: this.embedder.model,
      isSynthetic: options.isSynthetic ?? false,
    });
    return { id: result.id, duplicate: !result.created };
  }

  /**
   * Idempotent on the sha256 of the uploaded *bytes*: the same file uploaded twice
   * returns the existing candidate without re-parsing or re-embedding.
   */
  async ingestResume(args: {
    bytes: Uint8Array;
    mime: SourceMime;
    filename: string | null;
    fields: CandidateUploadFields;
    isSynthetic?: boolean;
  }): Promise<IngestOutcome> {
    const contentHash = sha256Hex(args.bytes);
    const existing = await this.repo.findCandidateIdByHash(contentHash);
    if (existing) return { id: existing, duplicate: true };

    let raw: string;
    try {
      raw = await this.extractText(args.bytes, args.mime);
    } catch (cause) {
      throw new AppError(422, "unprocessable_content", "Could not read text from the uploaded file", {
        reason: cause instanceof Error ? cause.message : String(cause),
      });
    }
    const resumeText = cleanText(raw);
    if (resumeText.length < MIN_RESUME_CHARS) {
      throw new AppError(
        422,
        "unprocessable_content",
        `Extracted resume text is too short (${resumeText.length} chars). Scanned/image-only PDFs are not supported.`,
      );
    }

    const chunks = chunkText(resumeText, this.chunkOptions);
    const headline = args.fields.headline;
    // A short context header helps chunks from the middle of a resume.
    const inputs = chunks.map((c) => (headline ? `${headline}\n\n${c.content}` : c.content));
    const vectors = await this.embedder.embed(inputs);
    if (vectors.length !== chunks.length) {
      throw new AppError(502, "upstream_error", "Embedding provider returned the wrong number of vectors");
    }

    const skills = normalizeSkills([...args.fields.skills, ...extractSkills(resumeText)]).slice(0, 100);
    const result = await this.repo.insertCandidateWithChunks(
      {
        fullName: args.fields.fullName,
        headline,
        location: args.fields.location,
        seniority: args.fields.seniority,
        skills,
        resumeText,
        sourceFilename: args.filename,
        sourceMime: args.mime,
        contentHash,
        isSynthetic: args.isSynthetic ?? false,
      },
      chunks.map((chunk, i) => ({
        chunkIndex: chunk.index,
        content: chunk.content,
        tokenEstimate: chunk.tokenEstimate,
        embedding: vectors[i] as number[],
        embeddingModel: this.embedder.model,
      })),
    );
    return { id: result.id, duplicate: !result.created, chunkCount: result.created ? chunks.length : undefined };
  }
}
