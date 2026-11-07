import Link from "next/link";
import type { ReactNode } from "react";
import { ExplanationPanel } from "./explanation-panel";
import { MatchScore } from "./match-score";
import { Badge, Card, EmptyState, Skeleton, SkillList, SyntheticBadge } from "./ui";
import type { CandidateMatch, JobMatch, SearchWeights } from "@/lib/types";
import { titleCase } from "@/lib/format";

function MatchRow({
  rank,
  href,
  title,
  subtitle,
  meta,
  skills,
  highlight,
  synthetic,
  score,
  explanation,
}: {
  rank: number;
  href: string;
  title: string;
  subtitle?: string;
  meta: string[];
  skills: string[];
  highlight: string[];
  synthetic: boolean;
  score: ReactNode;
  explanation: ReactNode;
}) {
  return (
    <li>
      <Card>
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-between">
          <div className="flex gap-4">
            <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-100 text-sm font-semibold tabular-nums dark:bg-slate-800" aria-label={`Rank ${rank}`}>
              {rank}
            </span>
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Link href={href} className="font-semibold hover:underline">
                  {title}
                </Link>
                {synthetic && <SyntheticBadge />}
              </div>
              {subtitle && <p className="text-sm text-slate-600 dark:text-slate-400">{subtitle}</p>}
              <div className="flex flex-wrap gap-2">
                {meta.map((m) => (
                  <Badge key={m}>{m}</Badge>
                ))}
              </div>
              <SkillList skills={skills} highlight={highlight} max={10} />
            </div>
          </div>
          {score}
        </div>
        <div className="mt-4 border-t border-slate-100 pt-4 dark:border-slate-800">{explanation}</div>
      </Card>
    </li>
  );
}

function NoExplanation({ topN }: { topN: number }) {
  return <p className="text-xs text-slate-500">Explanations are generated for the top {topN} matches only.</p>;
}

export function CandidateMatches({
  jobId,
  jobSkills,
  matches,
  weights,
  explainTopN,
}: {
  jobId: string;
  jobSkills: string[];
  matches: CandidateMatch[];
  weights: SearchWeights;
  explainTopN: number;
}) {
  if (matches.length === 0) {
    return (
      <EmptyState title="No matching candidates">
        No candidate passed the filters, or none share keywords or meaning with this job. Try clearing the filters.
      </EmptyState>
    );
  }
  return (
    <ol className="space-y-4">
      {matches.map((m, i) => (
        <MatchRow
          key={m.candidate_id}
          rank={i + 1}
          href={`/candidates/${m.candidate_id}`}
          title={m.full_name}
          subtitle={m.headline}
          meta={[titleCase(m.seniority), m.location]}
          skills={m.skills}
          highlight={jobSkills}
          synthetic={m.is_synthetic}
          score={<MatchScore rrfScore={m.rrf_score} keywordRank={m.keyword_rank} semanticRank={m.semantic_rank} semanticSimilarity={m.semantic_similarity} weights={weights} />}
          explanation={i < explainTopN ? <ExplanationPanel jobId={jobId} candidateId={m.candidate_id} /> : <NoExplanation topN={explainTopN} />}
        />
      ))}
    </ol>
  );
}

export function JobMatches({
  candidateId,
  candidateSkills,
  matches,
  weights,
  explainTopN,
}: {
  candidateId: string;
  candidateSkills: string[];
  matches: JobMatch[];
  weights: SearchWeights;
  explainTopN: number;
}) {
  if (matches.length === 0) {
    return (
      <EmptyState title="No matching jobs">No job passed the filters, or none relate to this resume. Try clearing the filters.</EmptyState>
    );
  }
  return (
    <ol className="space-y-4">
      {matches.map((m, i) => (
        <MatchRow
          key={m.job_id}
          rank={i + 1}
          href={`/jobs/${m.job_id}`}
          title={m.title}
          meta={[titleCase(m.seniority), m.location]}
          skills={m.skills}
          highlight={candidateSkills}
          synthetic={m.is_synthetic}
          score={<MatchScore rrfScore={m.rrf_score} keywordRank={m.keyword_rank} semanticRank={m.semantic_rank} semanticSimilarity={m.semantic_similarity} weights={weights} />}
          explanation={i < explainTopN ? <ExplanationPanel jobId={m.job_id} candidateId={candidateId} /> : <NoExplanation topN={explainTopN} />}
        />
      ))}
    </ol>
  );
}

export function MatchesSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <ol className="space-y-4" aria-busy="true" aria-label="Loading matches">
      {Array.from({ length: rows }, (_, i) => (
        <li key={i}>
          <Card>
            <div className="flex gap-4">
              <Skeleton className="h-8 w-8 rounded-full" />
              <div className="flex-1 space-y-3">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="h-3 w-2/3" />
              </div>
              <Skeleton className="h-10 w-28" />
            </div>
          </Card>
        </li>
      ))}
    </ol>
  );
}
