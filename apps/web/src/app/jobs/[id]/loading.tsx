import { MatchesSkeleton } from "@/components/matches";
import { Card, Skeleton } from "@/components/ui";

export default function Loading() {
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
      <Card>
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="mt-4 h-4 w-1/3" />
        <Skeleton className="mt-6 h-20 w-full" />
      </Card>
      <MatchesSkeleton />
    </div>
  );
}
