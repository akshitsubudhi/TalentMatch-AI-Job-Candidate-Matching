import { describe, expect, it } from "vitest";
import { createEmbedder } from "../src/embeddings";
import { createExplainer } from "../src/explain";
import { withoutEmptyStrings } from "../src/env";

describe("empty env values mean unset", () => {
  it("strips blank values", () => {
    expect(withoutEmptyStrings({ A: "", B: " ", C: "x", D: undefined })).toEqual({ C: "x" });
  });
  it("providers fall back to defaults for blank values", () => {
    expect(createEmbedder({ EMBEDDINGS_PROVIDER: "", OPENAI_API_KEY: "sk-test", OPENAI_EMBEDDING_MODEL: "" }).model).toBe("text-embedding-3-small");
    expect(createExplainer({ EXPLANATIONS_PROVIDER: "", OPENAI_API_KEY: "sk-test", OPENAI_CHAT_MODEL: "" }).model).toBe("gpt-5-mini");
  });
});
