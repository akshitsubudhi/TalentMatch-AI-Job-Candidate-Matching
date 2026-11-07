import { randomUUID } from "node:crypto";
import type { IngestionRepository, InsertResult, NewCandidateRow, NewChunkRow, NewJobRow } from "./types";

/** In-memory IngestionRepository for tests and offline experiments (not for production). */
export class InMemoryIngestionRepository implements IngestionRepository {
  readonly jobs = new Map<string, NewJobRow & { id: string }>();
  readonly candidates = new Map<string, NewCandidateRow & { id: string; chunks: NewChunkRow[] }>();

  async findJobIdByHash(contentHash: string): Promise<string | null> {
    for (const job of this.jobs.values()) if (job.contentHash === contentHash) return job.id;
    return null;
  }

  async insertJob(row: NewJobRow): Promise<InsertResult> {
    const existing = await this.findJobIdByHash(row.contentHash);
    if (existing) return { id: existing, created: false };
    const id = randomUUID();
    this.jobs.set(id, { ...row, id });
    return { id, created: true };
  }

  async findCandidateIdByHash(contentHash: string): Promise<string | null> {
    for (const c of this.candidates.values()) if (c.contentHash === contentHash) return c.id;
    return null;
  }

  async insertCandidateWithChunks(row: NewCandidateRow, chunks: NewChunkRow[]): Promise<InsertResult> {
    const existing = await this.findCandidateIdByHash(row.contentHash);
    if (existing) return { id: existing, created: false };
    const id = randomUUID();
    this.candidates.set(id, { ...row, id, chunks });
    return { id, created: true };
  }
}
