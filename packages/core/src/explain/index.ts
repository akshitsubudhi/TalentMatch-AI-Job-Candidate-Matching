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
}

export function createExplainer(env: ExplainerEnv): Explainer {
  const provider = env.EXPLANATIONS_PROVIDER || "openai";
  if (provider === "rules") return new RuleBasedExplainer();
  if (provider !== "openai") {
    throw new Error(`Unknown EXPLANATIONS_PROVIDER "${provider}" (expected "openai" or "rules")`);
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
