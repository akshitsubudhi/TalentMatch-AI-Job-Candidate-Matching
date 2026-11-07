"use client";

import Link from "next/link";
import { useState, type FormEvent, type ReactNode } from "react";
import { SENIORITIES } from "@talentmatch/core/constants";
import { titleCase } from "@/lib/format";

interface FieldError {
  path: string;
  message: string;
}
type SubmitState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "done"; id: string; duplicate: boolean }
  | { status: "error"; message: string; fields: FieldError[] };

const input =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-950";

function Field({ label, name, hint, errors, children }: { label: string; name: string; hint?: string; errors: FieldError[]; children: ReactNode }) {
  const error = errors.find((e) => e.path === name);
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
      {error && (
        <span className="mt-1 block text-xs text-rose-600" role="alert">
          {error.message}
        </span>
      )}
    </label>
  );
}

async function submit(url: string, init: RequestInit): Promise<SubmitState> {
  try {
    const res = await fetch(url, init);
    const body = (await res.json().catch(() => null)) as
      | { data: { id: string; duplicate: boolean } }
      | { error: { message: string; details?: unknown } }
      | null;
    if (body && "data" in body) return { status: "done", id: body.data.id, duplicate: body.data.duplicate };
    const details = body && "error" in body && Array.isArray(body.error.details) ? (body.error.details as FieldError[]) : [];
    return { status: "error", message: body && "error" in body ? body.error.message : `Request failed (${res.status})`, fields: details };
  } catch {
    return { status: "error", message: "Network error. Please try again.", fields: [] };
  }
}

function Result({ state, kind }: { state: SubmitState; kind: "job" | "candidate" }) {
  if (state.status === "done") {
    const href = kind === "job" ? `/jobs/${state.id}` : `/candidates/${state.id}`;
    return (
      <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
        {state.duplicate
          ? `This ${kind === "job" ? "job" : "resume"} was already ingested (same content hash), so no duplicate was created. `
          : `${kind === "job" ? "Job" : "Resume"} ingested. `}
        <Link className="font-medium underline" href={href}>
          View {kind === "job" ? "ranked candidates" : "ranked jobs"} →
        </Link>
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200">
        {state.message}
      </div>
    );
  }
  return null;
}

function SeniorityField({ errors }: { errors: FieldError[] }) {
  return (
    <Field label="Seniority" name="seniority" errors={errors}>
      <select name="seniority" required defaultValue="mid" className={input}>
        {SENIORITIES.map((s) => (
          <option key={s} value={s}>
            {titleCase(s)}
          </option>
        ))}
      </select>
    </Field>
  );
}

function SubmitButton({ busy, children }: { busy: boolean; children: ReactNode }) {
  return (
    <button
      type="submit"
      disabled={busy}
      className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:cursor-wait disabled:opacity-60"
    >
      {busy && <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" aria-hidden />}
      {children}
    </button>
  );
}

export function JobForm() {
  const [state, setState] = useState<SubmitState>({ status: "idle" });
  const errors = state.status === "error" ? state.fields : [];

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setState({ status: "submitting" });
    setState(
      await submit("/api/ingest/jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(Object.fromEntries(form.entries())),
      }),
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <Field label="Job title" name="title" errors={errors}>
        <input name="title" required minLength={2} maxLength={200} className={input} placeholder="Senior Backend Engineer" />
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Location" name="location" errors={errors} hint='e.g. "Berlin, Germany" or "Remote"'>
          <input name="location" required minLength={2} maxLength={120} className={input} placeholder="Remote" />
        </Field>
        <SeniorityField errors={errors} />
      </div>
      <Field label="Skills" name="skills" errors={errors} hint="Comma-separated. Aliases like “postgres” or “k8s” are normalised.">
        <input name="skills" className={input} placeholder="Node.js, PostgreSQL, Kubernetes" />
      </Field>
      <Field label="Description" name="description" errors={errors} hint="At least 20 characters.">
        <textarea name="description" required minLength={20} rows={8} className={input} placeholder="What the role involves…" />
      </Field>
      <div className="flex items-center gap-4">
        <SubmitButton busy={state.status === "submitting"}>{state.status === "submitting" ? "Embedding…" : "Post job"}</SubmitButton>
      </div>
      <Result state={state} kind="job" />
    </form>
  );
}

export function ResumeUploadForm() {
  const [state, setState] = useState<SubmitState>({ status: "idle" });
  const errors = state.status === "error" ? state.fields : [];

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) {
      setState({ status: "error", message: "Please choose a PDF or .txt resume.", fields: [] });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setState({ status: "error", message: "Resume must be 5 MB or smaller.", fields: [] });
      return;
    }
    setState({ status: "submitting" });
    setState(await submit("/api/ingest/candidates", { method: "POST", body: form }));
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <Field label="Resume (PDF or .txt, max 5 MB)" name="file" errors={errors}>
        <input
          name="file"
          type="file"
          required
          accept=".pdf,.txt,application/pdf,text/plain"
          className="block w-full text-sm file:mr-4 file:rounded-lg file:border-0 file:bg-brand-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-brand-700 hover:file:bg-brand-100"
        />
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Full name" name="fullName" errors={errors}>
          <input name="fullName" required maxLength={200} className={input} autoComplete="name" />
        </Field>
        <Field label="Headline" name="headline" errors={errors} hint="Optional, e.g. “Data engineer”.">
          <input name="headline" maxLength={300} className={input} />
        </Field>
        <Field label="Location" name="location" errors={errors}>
          <input name="location" required minLength={2} maxLength={120} className={input} placeholder="Remote" />
        </Field>
        <SeniorityField errors={errors} />
      </div>
      <Field label="Extra skills" name="skills" errors={errors} hint="Optional. Skills named in the resume are extracted automatically.">
        <input name="skills" className={input} placeholder="Python, Airflow" />
      </Field>
      <SubmitButton busy={state.status === "submitting"}>{state.status === "submitting" ? "Parsing & embedding…" : "Upload resume"}</SubmitButton>
      <Result state={state} kind="candidate" />
    </form>
  );
}
