export type SourceMime = "application/pdf" | "text/plain";

export interface NewJobRow {
  title: string;
  description: string;
  location: string;
  seniority: string;
  skills: string[];
  contentHash: string;
  embedding: number[];
  embeddingModel: string;
  isSynthetic: boolean;
}

export interface NewCandidateRow {
  fullName: string;
  headline: string;
  location: string;
  seniority: string;
  skills: string[];
  resumeText: string;
  sourceFilename: string | null;
  sourceMime: SourceMime;
  contentHash: string;
  isSynthetic: boolean;
}

export interface NewChunkRow {
  chunkIndex: number;
  content: string;
  tokenEstimate: number;
  embedding: number[];
  embeddingModel: string;
}

export interface InsertResult {
  id: string;
  /** false when a row with the same content_hash already existed. */
  created: boolean;
}

/** Storage port for ingestion; implemented with `pg` (and with an in-memory fake in tests). */
export interface IngestionRepository {
  findJobIdByHash(contentHash: string): Promise<string | null>;
  insertJob(row: NewJobRow): Promise<InsertResult>;
  findCandidateIdByHash(contentHash: string): Promise<string | null>;
  /** Inserts the candidate and all chunks atomically; no-op on duplicate content_hash. */
  insertCandidateWithChunks(row: NewCandidateRow, chunks: NewChunkRow[]): Promise<InsertResult>;
}
