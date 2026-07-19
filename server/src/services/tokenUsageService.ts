import { prisma } from "../config/prisma.js";
import { logger } from "../config/logger.js";
import type { AiOperation } from "../generated/prisma/enums.js";

// ─── Token usage recording ────────────────────────────
//
// Fire-and-forget: never blocks or fails the AI operation it measures. Called
// only when a real OpenAI response is available (the dev fallback makes no calls,
// so nothing is recorded then).

interface OpenAiUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

export function recordTokenUsage(
  operation: AiOperation,
  model: string,
  usage: OpenAiUsage | null | undefined,
): void {
  if (!usage) return;

  void prisma.tokenUsage
    .create({
      data: {
        operation,
        model,
        promptTokens: usage.prompt_tokens ?? 0,
        completionTokens: usage.completion_tokens ?? 0,
        totalTokens: usage.total_tokens ?? 0,
      },
    })
    .catch((error) =>
      logger.warn(
        `Token usage not recorded: ${error instanceof Error ? error.message : String(error)}`,
      ),
    );
}
