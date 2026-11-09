import type OpenAI from "openai";
import { ExplanationSchema, type Explanation } from "../schemas";
import { zodIssues } from "../errors";
import { buildUserPrompt, EXPLANATION_JSON_SCHEMA, PROMPT_VERSION, SYSTEM_PROMPT } from "./prompt";
import { constrainSkillsToJob } from "./sanitize";
import { ExplanationError, type Explainer, type ExplanationInput } from "./types";

export interface OpenAIExplainerOptions {
  client: Pick<OpenAI, "chat">;
  model?: string;
  /** Extra attempts when the model returns JSON that fails zod validation. */
  validationRetries?: number;
  maxCompletionTokens?: number;
  reasoningEffort?: "minimal" | "low" | "medium" | "high";
  /** OpenAI uses max_completion_tokens; OpenAI-compatible servers (Ollama) read max_tokens. */
  tokenLimitParam?: "max_completion_tokens" | "max_tokens";
  /** Label stored in match_explanations.model (defaults to `model`). */
  label?: string;
}

export class OpenAIExplainer implements Explainer {
  readonly model: string;
  readonly promptVersion = PROMPT_VERSION;
  private readonly client: Pick<OpenAI, "chat">;
  private readonly validationRetries: number;
  private readonly maxCompletionTokens: number;
  private readonly reasoningEffort: OpenAIExplainerOptions["reasoningEffort"];
  private readonly apiModel: string;
  private readonly tokenLimitParam: NonNullable<OpenAIExplainerOptions["tokenLimitParam"]>;

  constructor(options: OpenAIExplainerOptions) {
    this.client = options.client;
    this.apiModel = options.model ?? "gpt-5-mini";
    this.model = options.label ?? this.apiModel;
    this.tokenLimitParam = options.tokenLimitParam ?? "max_completion_tokens";
    this.validationRetries = options.validationRetries ?? 1;
    this.maxCompletionTokens = options.maxCompletionTokens ?? 2_000;
    this.reasoningEffort = options.reasoningEffort;
  }

  async explain(input: ExplanationInput): Promise<Explanation> {
    let lastProblem = "no attempts made";
    for (let attempt = 0; attempt <= this.validationRetries; attempt++) {
      let content: string | null | undefined;
      try {
        const completion = await this.client.chat.completions.create({
          model: this.apiModel,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: buildUserPrompt(input) },
          ],
          response_format: {
            type: "json_schema",
            json_schema: { name: "match_explanation", strict: true, schema: EXPLANATION_JSON_SCHEMA },
          },
          [this.tokenLimitParam]: this.maxCompletionTokens,
          ...(this.reasoningEffort ? { reasoning_effort: this.reasoningEffort } : {}),
        });
        const choice = completion.choices[0];
        if (choice?.message.refusal) throw new ExplanationError(`model refused: ${choice.message.refusal}`);
        content = choice?.message.content;
      } catch (cause) {
        if (cause instanceof ExplanationError) throw cause;
        throw new ExplanationError(`OpenAI chat request failed: ${cause instanceof Error ? cause.message : String(cause)}`, {
          cause,
        });
      }

      if (!content) {
        lastProblem = "empty response";
        continue;
      }
      let json: unknown;
      try {
        json = JSON.parse(content);
      } catch {
        lastProblem = "response was not valid JSON";
        continue;
      }
      const parsed = ExplanationSchema.safeParse(json);
      if (!parsed.success) {
        lastProblem = `schema validation failed: ${JSON.stringify(zodIssues(parsed.error))}`;
        continue;
      }
      return constrainSkillsToJob(parsed.data, input.job.skills);
    }
    throw new ExplanationError(`could not get a valid explanation: ${lastProblem}`);
  }
}
