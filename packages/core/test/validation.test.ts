import { describe, expect, it } from "vitest";
import {
  CandidateUploadFieldsSchema,
  countSentences,
  ExplanationSchema,
  JobCreateInputSchema,
  MatchQuerySchema,
} from "../src/schemas";
import { validationError } from "../src/errors";

const validJob = {
  title: "Senior Backend Engineer",
  description: "Design and operate Node.js services backed by PostgreSQL.",
  location: "Berlin, Germany",
  seniority: "senior",
  skills: ["node", "Postgres", "Kubernetes", "postgresql"],
};

describe("JobCreateInputSchema", () => {
  it("accepts a valid job and normalises + de-dupes skills", () => {
    const job = JobCreateInputSchema.parse(validJob);
    expect(job.skills).toEqual(["Node.js", "PostgreSQL", "Kubernetes"]);
  });

  it("accepts comma-separated skills from form posts", () => {
    expect(JobCreateInputSchema.parse({ ...validJob, skills: "React, typescript , ,CSS" }).skills).toEqual([
      "React",
      "TypeScript",
      "CSS",
    ]);
  });

  it("trims strings and defaults skills to []", () => {
    const { skills: _skills, ...rest } = validJob;
    const job = JobCreateInputSchema.parse({ ...rest, title: "  Data Engineer  " });
    expect(job.title).toBe("Data Engineer");
    expect(job.skills).toEqual([]);
  });

  it.each([
    ["title too short", { title: "a" }],
    ["description too short", { description: "short" }],
    ["unknown seniority", { seniority: "wizard" }],
    ["location missing", { location: "" }],
    ["too many skills", { skills: Array.from({ length: 51 }, (_, i) => `skill-${i}`) }],
    ["skill too long", { skills: ["x".repeat(61)] }],
  ])("rejects %s", (_label, patch) => {
    expect(JobCreateInputSchema.safeParse({ ...validJob, ...patch }).success).toBe(false);
  });

  it("produces structured validation errors", () => {
    const result = JobCreateInputSchema.safeParse({ ...validJob, seniority: "wizard", title: "" });
    expect(result.success).toBe(false);
    if (result.success) return;
    const err = validationError(result.error);
    expect(err.status).toBe(400);
    expect(err.code).toBe("validation_error");
    const paths = (err.details as { path: string }[]).map((d) => d.path).sort();
    expect(paths).toEqual(["seniority", "title"]);
  });
});

describe("CandidateUploadFieldsSchema", () => {
  it("parses form fields", () => {
    const fields = CandidateUploadFieldsSchema.parse({
      fullName: "Ada L.",
      location: "Remote",
      seniority: "mid",
      skills: "python, k8s",
    });
    expect(fields).toEqual({ fullName: "Ada L.", location: "Remote", seniority: "mid", headline: "", skills: ["Python", "Kubernetes"] });
  });
  it("requires a name", () => {
    expect(CandidateUploadFieldsSchema.safeParse({ fullName: " ", location: "Remote", seniority: "mid" }).success).toBe(false);
  });
});

describe("MatchQuerySchema", () => {
  it("coerces query-string values and applies defaults", () => {
    expect(MatchQuerySchema.parse({ limit: "5", keywordWeight: "0.5", location: "", seniority: "" })).toEqual({
      limit: 5,
      keywordWeight: 0.5,
    });
    expect(MatchQuerySchema.parse({}).limit).toBe(10);
  });
  it.each([{ limit: "0" }, { limit: "51" }, { limit: "2.5" }, { keywordWeight: "-1" }, { rrfK: "0" }, { seniority: "boss" }])(
    "rejects %o",
    (q) => {
      expect(MatchQuerySchema.safeParse(q).success).toBe(false);
    },
  );
});

describe("ExplanationSchema", () => {
  const ok = {
    summary: "Strong backend profile with production Node.js and PostgreSQL work. Lacks Kubernetes experience.",
    matched_skills: ["Node.js", "PostgreSQL"],
    missing_skills: ["Kubernetes"],
  };
  it("accepts 2–3 sentences", () => {
    expect(ExplanationSchema.safeParse(ok).success).toBe(true);
  });
  it("rejects 1 or 4+ sentences, missing fields and wrong types", () => {
    expect(ExplanationSchema.safeParse({ ...ok, summary: "Only one sentence here, quite long though." }).success).toBe(false);
    expect(ExplanationSchema.safeParse({ ...ok, summary: "One. Two is here. Three is here. Four is here too." }).success).toBe(false);
    expect(ExplanationSchema.safeParse({ summary: ok.summary }).success).toBe(false);
    expect(ExplanationSchema.safeParse({ ...ok, matched_skills: "Node.js" }).success).toBe(false);
  });
  it("counts sentences without splitting on abbreviations or decimals", () => {
    expect(countSentences("Knows e.g. Go and Rust. Has 2.5 years of experience.")).toBe(2);
    expect(countSentences("One! Two? Three.")).toBe(3);
  });
});
