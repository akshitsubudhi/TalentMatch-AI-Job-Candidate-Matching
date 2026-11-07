import type { Metadata, Viewport } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "TalentMatch", template: "%s · TalentMatch" },
  description: "Hybrid (full-text + vector) job–candidate matching with LLM explanations.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

const nav = [
  { href: "/jobs", label: "Jobs" },
  { href: "/candidates", label: "Candidates" },
  { href: "/jobs/new", label: "Post a job" },
  { href: "/candidates/upload", label: "Upload resume" },
];

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:rounded focus:bg-white focus:px-3 focus:py-2">
          Skip to content
        </a>
        <header className="border-b border-slate-200 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
            <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand-600 text-sm text-white" aria-hidden>
                T
              </span>
              TalentMatch
            </Link>
            <nav aria-label="Main">
              <ul className="flex flex-wrap gap-1 text-sm">
                {nav.map((item) => (
                  <li key={item.href}>
                    <Link href={item.href} className="rounded-md px-3 py-1.5 text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        </header>
        <main id="main" className="mx-auto max-w-6xl px-4 py-8">
          {children}
        </main>
        <footer className="mx-auto max-w-6xl px-4 pb-10 text-xs text-slate-500">
          Demo data is synthetic. Match scores come from Reciprocal Rank Fusion of Postgres full-text and pgvector rankings.
        </footer>
      </body>
    </html>
  );
}
