import type pg from "pg";
import { toPgVector } from "../embeddings/types";
import type { IngestionRepository, InsertResult, NewCandidateRow, NewChunkRow, NewJobRow } from "../ingest/types";

export class PgIngestionRepository implements IngestionRepository {
  constructor(private readonly pool: pg.Pool) {}

  async findJobIdByHash(contentHash: string): Promise<string | null> {
    const { rows } = await this.pool.query<{ id: string }>("select id from public.jobs where content_hash = $1", [
      contentHash,
    ]);
    return rows[0]?.id ?? null;
  }

  async insertJob(row: NewJobRow): Promise<InsertResult> {
    const { rows } = await this.pool.query<{ id: string }>(
      `insert into public.jobs
         (title, description, location, seniority, skills, content_hash, embedding, embedding_model, is_synthetic)
       values ($1, $2, $3, $4, $5, $6, $7::extensions.vector, $8, $9)
       on conflict (content_hash) do nothing
       returning id`,
      [
        row.title,
        row.description,
        row.location,
        row.seniority,
        row.skills,
        row.contentHash,
        toPgVector(row.embedding),
        row.embeddingModel,
        row.isSynthetic,
      ],
    );
    if (rows[0]) return { id: rows[0].id, created: true };
    const existing = await this.findJobIdByHash(row.contentHash);
    if (!existing) throw new Error("job insert conflicted but no existing row was found");
    return { id: existing, created: false };
  }

  async findCandidateIdByHash(contentHash: string): Promise<string | null> {
    const { rows } = await this.pool.query<{ id: string }>(
      "select id from public.candidates where content_hash = $1",
      [contentHash],
    );
    return rows[0]?.id ?? null;
  }

  async insertCandidateWithChunks(row: NewCandidateRow, chunks: NewChunkRow[]): Promise<InsertResult> {
    if (chunks.length === 0) throw new Error("a candidate needs at least one chunk");
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const inserted = await client.query<{ id: string }>(
        `insert into public.candidates
           (full_name, headline, location, seniority, skills, resume_text, source_filename, source_mime, content_hash, is_synthetic)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         on conflict (content_hash) do nothing
         returning id`,
        [
          row.fullName,
          row.headline,
          row.location,
          row.seniority,
          row.skills,
          row.resumeText,
          row.sourceFilename,
          row.sourceMime,
          row.contentHash,
          row.isSynthetic,
        ],
      );
      const candidateId = inserted.rows[0]?.id;
      if (!candidateId) {
        // Lost a race with a concurrent upload of the same file.
        await client.query("rollback");
        const existing = await this.findCandidateIdByHash(row.contentHash);
        if (!existing) throw new Error("candidate insert conflicted but no existing row was found");
        return { id: existing, created: false };
      }

      const values: unknown[] = [];
      const tuples = chunks.map((chunk, i) => {
        const b = i * 6;
        values.push(
          candidateId,
          chunk.chunkIndex,
          chunk.content,
          chunk.tokenEstimate,
          toPgVector(chunk.embedding),
          chunk.embeddingModel,
        );
        return `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}::extensions.vector, $${b + 6})`;
      });
      await client.query(
        `insert into public.candidate_chunks
           (candidate_id, chunk_index, content, token_estimate, embedding, embedding_model)
         values ${tuples.join(", ")}`,
        values,
      );
      await client.query("commit");
      return { id: candidateId, created: true };
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}
