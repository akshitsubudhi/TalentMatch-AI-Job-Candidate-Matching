import { describe, expect, it } from "vitest";
import { buildLabelledSet, FAMILIES, generateDataset, IMPLIED, SPELLINGS, SYNTHETIC_RESUME_HEADER } from "../src/seed";
import { extractSkills, normalizeSkill, SKILLS } from "../src/skills";
import { CandidateUploadFieldsSchema, JobCreateInputSchema } from "../src/schemas";

const dataset = generateDataset();

describe("synthetic dataset", () => {
  it("has the requested size and is deterministic", () => {
    expect(dataset.jobs).toHaveLength(200);
    expect(dataset.candidates).toHaveLength(500);
    expect(generateDataset()).toEqual(dataset);
    expect(generateDataset({ seed: 7 }).candidates[0]).not.toEqual(dataset.candidates[0]);
  });

  it("labels every record as synthetic", () => {
    for (const c of dataset.candidates) expect(c.resumeText.startsWith(SYNTHETIC_RESUME_HEADER)).toBe(true);
    for (const j of dataset.jobs) expect(j.input.description).toMatch(/Synthetic job post/);
  });

  it("produces inputs that pass the same validation as the API", () => {
    for (const j of dataset.jobs) expect(JobCreateInputSchema.safeParse(j.input).success).toBe(true);
    for (const c of dataset.candidates) expect(CandidateUploadFieldsSchema.safeParse(c.fields).success).toBe(true);
  });

  it("produces unique resumes and jobs (content hashes will not collide)", () => {
    expect(new Set(dataset.candidates.map((c) => c.resumeText)).size).toBe(500);
    expect(new Set(dataset.jobs.map((j) => j.input.description + j.input.title)).size).toBe(200);
  });

  it("only uses canonical vocabulary skills, each with an implied phrase", () => {
    const canonical = new Set(SKILLS.map((s) => s.name));
    for (const f of FAMILIES) {
      for (const s of [...f.core, ...f.optional]) {
        expect(canonical.has(s), s).toBe(true);
        expect(IMPLIED[s], s).toBeTruthy();
      }
    }
    for (const [skill, spellings] of Object.entries(SPELLINGS)) {
      for (const sp of spellings) expect(normalizeSkill(sp)).toBe(skill);
    }
  });

  it("implied phrases never name a vocabulary skill (keyword search cannot see them)", () => {
    for (const [skill, phrase] of Object.entries(IMPLIED)) {
      expect(extractSkills(phrase), `${skill}: "${phrase}"`).toEqual([]);
    }
  });

  it("explicit skills are extractable from the resume text; implied ones mostly are not", () => {
    let impliedTotal = 0;
    let impliedLeaked = 0;
    for (const c of dataset.candidates) {
      const found = new Set(extractSkills(c.resumeText));
      for (const s of c.explicitSkills) expect(found.has(s), `${c.index}: ${s}`).toBe(true);
      for (const s of c.trueSkills.filter((x) => !c.explicitSkills.includes(x))) {
        impliedTotal++;
        if (found.has(s)) impliedLeaked++;
      }
    }
    expect(impliedTotal).toBeGreaterThan(500);
    // Leaks only happen through other text (e.g. a headline word); keep them rare.
    expect(impliedLeaked / impliedTotal).toBeLessThan(0.05);
  });
});

describe("labelled set", () => {
  const labels = buildLabelledSet(dataset);
  it("has 40 queries with 3–10 relevant candidates each (>= 30 job→candidate queries)", () => {
    expect(labels).toHaveLength(40);
    for (const q of labels) {
      expect(q.relevantCandidateIndexes.length).toBeGreaterThanOrEqual(3);
      expect(q.relevantCandidateIndexes.length).toBeLessThanOrEqual(10);
    }
  });
  it("relevance follows the ground-truth rule", () => {
    for (const q of labels) {
      const job = dataset.jobs[q.jobIndex]!;
      for (const ci of q.relevantCandidateIndexes) {
        const c = dataset.candidates[ci]!;
        expect(c.family).toBe(job.family);
        const covered = job.input.skills.filter((s) => c.trueSkills.includes(s)).length;
        expect(covered / job.input.skills.length).toBeGreaterThanOrEqual(0.6);
      }
    }
  });
});
