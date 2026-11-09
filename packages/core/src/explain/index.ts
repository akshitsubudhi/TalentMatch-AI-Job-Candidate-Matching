import OpenAI from "openai";
import { OpenAIExplainer } from "./openai";
import { RuleBasedExplainer } from "./rules";
import type { Explainer } from "./types";

export * from "./types";
export * from "./prompt";
export * from "./sanitize";
export * from "./cache";
export { OpenAIExplainer } from "./openai";
export { RuleBasedExplainer } from "./rules";

export interface ExplainerEnv {
  EXPLANATIONS_PROVIDER?: string | undefined;
  OPENAI_API_KEY?: string | undefined;
  OPENAI_CHAT_MODEL?: string | undefined;
  OPENAI_BASE_URL?: string | undefined;
  OPENAI_REASONING_EFFORT?: string | undefined;
  OLLAMA_BASE_URL?: string | undefined;
  OLLAMA_CHAT_MODEL?: string | undefined;
}

export function createExplainer(env: ExplainerEnv): Explainer {
  const provider = env.EXPLANATIONS_PROVIDER || "openai";
  if (provider === "rules") return new RuleBasedExplainer();
  if (provider === "ollama") {
    const model = env.OLLAMA_CHAT_MODEL || "llama3.1:8b";
    return new OpenAIExplainer({
      // Ollama's OpenAI-compatible endpoint: the SDK requires an API key, Ollama ignores it.
      client: new OpenAI({ apiKey: "ollama", baseURL: env.OLLAMA_BASE_URL || "http://localhost:11434/v1", maxRetries: 1, timeout: 180_000 }),
      model,
      label: `ollama/${model}`,
      tokenLimitParam: "max_tokens",
      // Small local models break the 2–3 sentence rule more often; allow one more retry.
      validationRetries: 2,
      maxCompletionTokens: 600,
    });
  }
  if (provider !== "openai") {
    throw new Error(`Unknown EXPLANATIONS_PROVIDER "${provider}" (expected "openai", "ollama" or "rules")`);
  }
  if (!env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is required when EXPLANATIONS_PROVIDER=openai");
  const effort = env.OPENAI_REASONING_EFFORT;
  const allowed = ["minimal", "low", "medium", "high"] as const;
  const reasoningEffort = allowed.find((e) => e === effort);
  return new OpenAIExplainer({
    client: new OpenAI({
      apiKey: env.OPENAI_API_KEY,
      ...(env.OPENAI_BASE_URL ? { baseURL: env.OPENAI_BASE_URL } : {}),
      maxRetries: 2,
      timeout: 60_000,
    }),
    model: env.OPENAI_CHAT_MODEL || "gpt-5-mini",
    ...(reasoningEffort ? { reasoningEffort } : {}),
  });
}
