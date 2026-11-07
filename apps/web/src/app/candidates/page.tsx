import Link from "next/link";
import type { Metadata } from "next";
import { FilterBar } from "@/components/filter-bar";
import { Pagination } from "@/components/pagination";
import { Badge, ButtonLink, EmptyState, PageHeader, SkillList, SyntheticBadge } from "@/components/ui";
import { distinctLocations, listCandidates, PAGE_SIZE } from "@/lib/server/data";
import { parseListParams, type RawSearchParams } from "@/lib/search-params";
import { plural, titleCase } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Candidates" };

export default async function CandidatesPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const params = parseListParams(await searchParams);
  const [{ rows, total }, locations] = await Promise.all([listCandidates(params), distinctLocations("candidates")]);

  return (
    <>
      <PageHeader
        title="Candidates"
        subtitle={plural(total, "candidate")}
        actions={<ButtonLink href="/candidates/upload">Upload resume</ButtonLink>}
      />
      <FilterBar action="/candidates" locations={locations} location={params.location} seniority={params.seniority} />
      {rows.length === 0 ? (
        <EmptyState title="No candidates found" action={<ButtonLink href="/candidates/upload">Upload a resume</ButtonLink>}>
          {params.location || params.seniority ? "Try clearing a filter." : "Upload a resume, or run `pnpm seed` for synthetic demo data."}
        </EmptyState>
      ) : (
        <ul className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
          {rows.map((c) => (
            <li key={c.id}>
              <Link href={`/candidates/${c.id}`} className="flex flex-col gap-2 px-5 py-4 hover:bg-slate-50 dark:hover:bg-slate-800/60 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{c.full_name}</span>
                    {c.is_synthetic && <SyntheticBadge />}
                  </div>
                  <div className="text-sm text-slate-600 dark:text-slate-400">{c.headline || "—"}</div>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                  <Badge tone="brand">{titleCase(c.seniority)}</Badge>
                  <Badge>{c.location}</Badge>
                  <span className="hidden lg:block">
                    <SkillList skills={c.skills} max={4} />
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Pagination basePath="/candidates" page={params.page} total={total} pageSize={PAGE_SIZE} params={{ location: params.location, seniority: params.seniority }} />
    </>
  );
}
