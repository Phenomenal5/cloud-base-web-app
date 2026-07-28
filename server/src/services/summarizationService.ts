import OpenAI from "openai";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { recordTokenUsage } from "./tokenUsageService.js";

// Plain-language summary of a narrative. Callers cache the result on the report
// row, so the same text is never summarized twice.

const client = env.openaiApiKey ? new OpenAI({ apiKey: env.openaiApiKey }) : null;

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

// The first couple of sentences, which is enough to be useful without a model.
function fallbackSummary(narrative: string): string {
  const sentences = narrative
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?])\s+/);
  return `${sentences.slice(0, 2).join(" ")} (Set OPENAI_API_KEY for a generated summary.)`;
}
