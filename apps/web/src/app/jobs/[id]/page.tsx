import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { UuidSchema } from "@talentmatch/core";
import { FilterBar } from "@/components/filter-bar";
import { CandidateMatches, MatchesSkeleton } from "@/components/matches";
import { Badge, Card, Notice, SkillList, SyntheticBadge } from "@/components/ui";
import { distinctLocations, getJob, matchCandidatesForJob, resolveWeights } from "@/lib/server/data";
import { serverEnv } from "@/lib/server/env";
import { parseMatchParams, type RawSearchParams } from "@/lib/search-params";
import { titleCase } from "@/lib/format";
import type { MatchQuery } from "@talentmatch/core";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<RawSearchParams> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  if (!UuidSchema.safeParse(id).success) return { title: "Job not found" };
  const job = await getJob(id);
  return { title: job ? job.title : "Job not found" };
}

async function RankedCandidates({ jobId, jobSkills, query }: { jobId: string; jobSkills: string[]; query: MatchQuery }) {
  const weights = resolveWeights(query);
  const matches = await matchCandidatesForJob(jobId, query, weights);
  return <CandidateMatches jobId={jobId} jobSkills={jobSkills} matches={matches} weights={weights} explainTopN={serverEnv().EXPLAIN_TOP_N} />;
}

export default async function JobPage({ params, searchParams }: Props) {
  const { id } = await params;
  if (!UuidSchema.safeParse(id).success) notFound();
  const { query, error } = parseMatchParams(await searchParams);
  const [job, locations] = await Promise.all([getJob(id), distinctLocations("candidates")]);
  if (!job) notFound();

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
      <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
        <Card>
          <div className="flex items-start justify-between gap-2">
            <h1 className="text-xl font-semibold leading-snug">{job.title}</h1>
            {job.is_synthetic && <SyntheticBadge />}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge tone="brand">{titleCase(job.seniority)}</Badge>
            <Badge>{job.location}</Badge>
          </div>
          <h2 className="mt-5 mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Required skills</h2>
          <SkillList skills={job.skills} max={50} />
          <details className="mt-5 group">
            <summary className="cursor-pointer text-sm font-medium text-brand-600">Job description</summary>
            <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-slate-700 dark:text-slate-300">{job.description}</p>
          </details>
        </Card>
      </aside>
      <section aria-labelledby="ranked-candidates">
        <h2 id="ranked-candidates" className="mb-1 text-lg font-semibold">
          Ranked candidates
        </h2>
        <p className="mb-4 text-sm text-slate-600 dark:text-slate-400">
          Hybrid search over resume chunks; filters are applied before ranking. Green skills appear on the job.
        </p>
        {error && <Notice>{error}</Notice>}
        <FilterBar action={`/jobs/${job.id}`} locations={locations} location={query.location} seniority={query.seniority} label="Filter candidates" />
        <Suspense key={JSON.stringify(query)} fallback={<MatchesSkeleton />}>
          <RankedCandidates jobId={job.id} jobSkills={job.skills} query={query} />
        </Suspense>
      </section>
    </div>
  );
}
