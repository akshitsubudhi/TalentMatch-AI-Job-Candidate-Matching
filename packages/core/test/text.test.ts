import { describe, expect, it } from "vitest";
import { cleanText } from "../src/text/clean";
import { extractSkills, normalizeSkill, normalizeSkills } from "../src/skills";
import { sha256Hex } from "../src/ingest/hash";

describe("cleanText", () => {
  it("normalises ligatures, bullets, dashes and whitespace", () => {
    expect(cleanText("\uFB01nance\u00A0\u00A0team \u2022 led   work \u2014 shipped")).toBe("finance team - led work - shipped");
  });
  it("re-joins hyphenated line breaks and removes page-number lines", () => {
    const raw = "Built data engi-\nneering pipelines.\nPage 1 of 2\n\n\n\n2\nNext section";
    expect(cleanText(raw)).toBe("Built data engineering pipelines.\n\nNext section");
  });
  it("strips control and zero-width characters", () => {
    expect(cleanText("a\u0000b\u200Bc\uFEFF\r\nd")).toBe("a bc\nd");
  });
});

describe("skills", () => {
  it("normalises aliases case-insensitively", () => {
    expect(normalizeSkill(" postgres ")).toBe("PostgreSQL");
    expect(normalizeSkill("k8s")).toBe("Kubernetes");
    expect(normalizeSkill("Some Niche Tool")).toBe("Some Niche Tool");
    expect(normalizeSkills(["React.js", "react", "Vue"])).toEqual(["React", "Vue.js"]);
  });
  it("extracts skills with symbol-aware boundaries", () => {
    const found = extractSkills("Wrote C++ and C# services, Node.js APIs on K8s with Postgres. Good at Go.");
    expect(found).toEqual(expect.arrayContaining(["C#", "C++", "Node.js", "PostgreSQL", "Kubernetes", "Go"]));
  });
  it("avoids false positives inside other words", () => {
    const found = extractSkills("I am a good researcher who restored things");
    expect(found).not.toContain("Go");
    expect(found).not.toContain("R");
    expect(found).not.toContain("REST APIs");
  });
});

describe("sha256Hex", () => {
  it("matches a known vector", () => {
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(sha256Hex(new TextEncoder().encode("abc"))).toBe(sha256Hex("abc"));
  });
});
