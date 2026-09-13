import OpenAI from "openai";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { recordTokenUsage } from "./tokenUsageService.js";

// turns a report narrative into something a trainee can read. the caller caches
// the result on the row, so we never pay to summarise the same report twice

const client = env.openaiApiKey ? new OpenAI({ apiKey: env.openaiApiKey }) : null;

const SUMMARY_MAX_TOKENS = 200;

const SYSTEM_PROMPT =
  "Summarize this aviation safety report in 2 to 3 plain-language sentences a trainee pilot can understand. Briefly explain any jargon. Use only what's in the report, do not add facts.";

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

// no model, so just take the first couple of sentences. not a summary, but it's
// something to show instead of an empty box
function fallbackSummary(narrative: string): string {
  const sentences = narrative
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?])\s+/);
  return `${sentences.slice(0, 2).join(" ")} (Set OPENAI_API_KEY for a generated summary.)`;
}
