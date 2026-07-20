import OpenAI from "openai";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { recordTokenUsage } from "./tokenUsageService.js";

// ─── Summarization service (FR-19) ────────────────────
//
// Plain-language summary of a report's narrative. LLM when a key is set;
// otherwise a deterministic first-sentences fallback. Callers cache the result
// (see reports controller) so the same text is never re-summarized (§8.5).

const client = env.openaiApiKey ? new OpenAI({ apiKey: env.openaiApiKey }) : null;

// Hard output-token cap (FR-18) — locked as a constant, not env-tunable.
const SUMMARY_MAX_TOKENS = 200;

const SYSTEM_PROMPT =
  "Summarize this aviation safety report in 2–3 plain-language sentences a trainee pilot can understand. Briefly explain any jargon. Use only what's in the report — do not add facts.";

export async function summarizeReport(narrative: string): Promise<string> {
  if (!client) return fallbackSummary(narrative);

  try {
    const response = await client.chat.completions.create({
      model: env.chatModel,
      temperature: 0.2,
      max_completion_tokens: SUMMARY_MAX_TOKENS,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: narrative },
      ],
    });
    recordTokenUsage("SUMMARIZATION", env.chatModel, response.usage);
    return response.choices[0]?.message?.content?.trim() || fallbackSummary(narrative);
  } catch (error) {
    logger.warn(
      `Summarization fell back: ${error instanceof Error ? error.message : String(error)}`,
    );
    return fallbackSummary(narrative);
  }
}

// First two sentences — enough to be useful without an LLM.
function fallbackSummary(narrative: string): string {
  const sentences = narrative
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?])\s+/);
  return `${sentences.slice(0, 2).join(" ")} (Dev summary — set OPENAI_API_KEY for an LLM summary.)`;
}
