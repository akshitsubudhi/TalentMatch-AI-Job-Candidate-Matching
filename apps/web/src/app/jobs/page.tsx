import Link from "next/link";
import type { Metadata } from "next";
import { FilterBar } from "@/components/filter-bar";
import { Pagination } from "@/components/pagination";
import { Badge, ButtonLink, EmptyState, PageHeader, SkillList, SyntheticBadge } from "@/components/ui";
import { distinctLocations, listJobs, PAGE_SIZE } from "@/lib/server/data";
import { parseListParams, type RawSearchParams } from "@/lib/search-params";
import { plural, titleCase } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Jobs" };

export default async function JobsPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const params = parseListParams(await searchParams);
  const [{ rows, total }, locations] = await Promise.all([listJobs(params), distinctLocations("jobs")]);

  return (
    <>
      <PageHeader title="Jobs" subtitle={plural(total, "job")} actions={<ButtonLink href="/jobs/new">Post a job</ButtonLink>} />
      <FilterBar action="/jobs" locations={locations} location={params.location} seniority={params.seniority} />
      {rows.length === 0 ? (
        <EmptyState
          title={params.location || params.seniority ? "No jobs match these filters" : "No jobs yet"}
          action={<ButtonLink href="/jobs/new">Post the first job</ButtonLink>}
        >
          {params.location || params.seniority ? "Try clearing a filter." : "Post a job, or run `pnpm seed` to load the synthetic demo data."}
        </EmptyState>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((job) => (
            <li key={job.id}>
              <Link
                href={`/jobs/${job.id}`}
                className="flex h-full flex-col gap-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-brand-500 hover:shadow dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="flex items-start justify-between gap-2">
                  <h2 className="font-semibold leading-snug">{job.title}</h2>
                  {job.is_synthetic && <SyntheticBadge />}
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <Badge tone="brand">{titleCase(job.seniority)}</Badge>
                  <Badge>{job.location}</Badge>
                </div>
                <SkillList skills={job.skills} max={6} />
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Pagination basePath="/jobs" page={params.page} total={total} pageSize={PAGE_SIZE} params={{ location: params.location, seniority: params.seniority }} />
    </>
  );
}
