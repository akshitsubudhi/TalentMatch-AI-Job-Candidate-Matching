import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { UuidSchema, type MatchQuery } from "@talentmatch/core";
import { FilterBar } from "@/components/filter-bar";
import { JobMatches, MatchesSkeleton } from "@/components/matches";
import { Badge, Card, Notice, SkillList, SyntheticBadge } from "@/components/ui";
import { distinctLocations, getCandidate, matchJobsForCandidate, resolveWeights } from "@/lib/server/data";
import { serverEnv } from "@/lib/server/env";
import { parseMatchParams, type RawSearchParams } from "@/lib/search-params";
import { titleCase } from "@/lib/format";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<RawSearchParams> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  if (!UuidSchema.safeParse(id).success) return { title: "Candidate not found" };
  const c = await getCandidate(id);
  return { title: c ? c.full_name : "Candidate not found" };
}

async function RankedJobs({ candidateId, skills, query }: { candidateId: string; skills: string[]; query: MatchQuery }) {
  const weights = resolveWeights(query);
  const matches = await matchJobsForCandidate(candidateId, query, weights);
  return <JobMatches candidateId={candidateId} candidateSkills={skills} matches={matches} weights={weights} explainTopN={serverEnv().EXPLAIN_TOP_N} />;
}

export default async function CandidatePage({ params, searchParams }: Props) {
  const { id } = await params;
  if (!UuidSchema.safeParse(id).success) notFound();
  const { query, error } = parseMatchParams(await searchParams);
  const [candidate, locations] = await Promise.all([getCandidate(id), distinctLocations("jobs")]);
  if (!candidate) notFound();

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
      <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
        <Card>
          <div className="flex items-start justify-between gap-2">
            <div>
              <h1 className="text-xl font-semibold">{candidate.full_name}</h1>
              <p className="text-sm text-slate-600 dark:text-slate-400">{candidate.headline}</p>
            </div>
            {candidate.is_synthetic && <SyntheticBadge />}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge tone="brand">{titleCase(candidate.seniority)}</Badge>
            <Badge>{candidate.location}</Badge>
            <Badge>{candidate.source_mime === "application/pdf" ? "PDF" : "Text"}</Badge>
          </div>
          <h2 className="mt-5 mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Skills (listed or extracted)</h2>
          <SkillList skills={candidate.skills} max={50} />
          <details className="mt-5">
            <summary className="cursor-pointer text-sm font-medium text-brand-600">Resume text</summary>
            <pre className="mt-3 max-h-[28rem] overflow-auto whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-700 dark:text-slate-300">
              {candidate.resume_text}
            </pre>
          </details>
        </Card>
      </aside>
      <section aria-labelledby="ranked-jobs">
        <h2 id="ranked-jobs" className="mb-1 text-lg font-semibold">
          Ranked jobs
        </h2>
        <p className="mb-4 text-sm text-slate-600 dark:text-slate-400">
          Each resume chunk is matched against job embeddings; a job&apos;s semantic score is its closest chunk.
        </p>
        {error && <Notice>{error}</Notice>}
        <FilterBar action={`/candidates/${candidate.id}`} locations={locations} location={query.location} seniority={query.seniority} label="Filter jobs" />
        <Suspense key={JSON.stringify(query)} fallback={<MatchesSkeleton />}>
          <RankedJobs candidateId={candidate.id} skills={candidate.skills} query={query} />
        </Suspense>
      </section>
    </div>
  );
}
