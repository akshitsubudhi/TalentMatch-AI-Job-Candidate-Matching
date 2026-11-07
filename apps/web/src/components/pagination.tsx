import Link from "next/link";

export function Pagination({ basePath, page, total, pageSize, params }: { basePath: string; page: number; total: number; pageSize: number; params: Record<string, string | undefined> }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const href = (p: number) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v);
    qs.set("page", String(p));
    return `${basePath}?${qs.toString()}`;
  };
  const link = "rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-white dark:border-slate-700 dark:hover:bg-slate-900";
  return (
    <nav className="mt-8 flex items-center justify-between" aria-label="Pagination">
      {page > 1 ? <Link className={link} href={href(page - 1)}>← Previous</Link> : <span />}
      <span className="text-sm text-slate-600 dark:text-slate-400">
        Page {page} of {pages}
      </span>
      {page < pages ? <Link className={link} href={href(page + 1)}>Next →</Link> : <span />}
    </nav>
  );
}
