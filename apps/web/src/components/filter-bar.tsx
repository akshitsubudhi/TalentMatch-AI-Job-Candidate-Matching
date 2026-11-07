import Link from "next/link";
import { SENIORITIES } from "@talentmatch/core/constants";
import { titleCase } from "@/lib/format";

/** Plain GET form: works without JavaScript, and the URL is shareable. */
export function FilterBar({
  action,
  locations,
  location,
  seniority,
  label = "Filter",
}: {
  action: string;
  locations: string[];
  location?: string | undefined;
  seniority?: string | undefined;
  label?: string;
}) {
  const select =
    "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 sm:w-48";
  return (
    <form action={action} method="get" className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end" aria-label={label}>
      <label className="flex flex-col gap-1 text-xs font-medium text-slate-600 dark:text-slate-400">
        Location
        <select name="location" defaultValue={location ?? ""} className={select}>
          <option value="">Any location</option>
          {locations.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-slate-600 dark:text-slate-400">
        Seniority
        <select name="seniority" defaultValue={seniority ?? ""} className={select}>
          <option value="">Any seniority</option>
          {SENIORITIES.map((s) => (
            <option key={s} value={s}>
              {titleCase(s)}
            </option>
          ))}
        </select>
      </label>
      <div className="flex gap-2">
        <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300">
          Apply
        </button>
        {(location || seniority) && (
          <Link href={action} className="rounded-lg px-3 py-2 text-sm text-slate-600 hover:underline dark:text-slate-400">
            Clear
          </Link>
        )}
      </div>
    </form>
  );
}
