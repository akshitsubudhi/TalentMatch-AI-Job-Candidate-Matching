import { ButtonLink, Card } from "@/components/ui";
import { counts } from "@/lib/server/data";
import { plural } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const c = await counts();
  return (
    <div className="space-y-10">
      <section className="max-w-3xl">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Match jobs and candidates with hybrid search</h1>
        <p className="mt-3 text-slate-600 dark:text-slate-400">
          Every ranking combines Postgres full-text search (keyword relevance) with pgvector cosine similarity (semantic
          relevance) using Reciprocal Rank Fusion, all in one SQL function. Top matches come with a short explanation
          and the skills that match or are missing.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <ButtonLink href="/jobs">Browse {plural(c.jobs, "job")}</ButtonLink>
          <ButtonLink href="/candidates" variant="secondary">
            Browse {plural(c.candidates, "candidate")}
          </ButtonLink>
        </div>
      </section>
      <section className="grid gap-4 sm:grid-cols-3">
        {[
          ["1. Ingest", "Resumes (PDF or text) are parsed, cleaned, chunked and embedded. Re-uploading the same file is a no-op."],
          ["2. Retrieve", "Keyword (tsvector + GIN) and vector (HNSW) candidates are retrieved with filters applied first."],
          ["3. Fuse & explain", "RRF merges both rankings. An LLM explains the top matches; results are cached per prompt version."],
        ].map(([title, body]) => (
          <Card key={title}>
            <h2 className="font-semibold">{title}</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{body}</p>
          </Card>
        ))}
      </section>
    </div>
  );
}
