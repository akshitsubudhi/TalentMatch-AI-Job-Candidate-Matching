"use client";

import { EmptyState } from "@/components/ui";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <EmptyState
      title="Something went wrong"
      action={
        <button type="button" onClick={reset} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white">
          Try again
        </button>
      }
    >
      The server could not load this page{error.digest ? ` (ref ${error.digest})` : ""}. Check that the database is reachable and the
      environment variables are set.
    </EmptyState>
  );
}
