import { prisma } from "../config/prisma.js";
import { logger } from "../config/logger.js";
import type { AiOperation } from "../generated/prisma/enums.js";

// Fire and forget: recording usage must never block or fail the AI call it's
// measuring. Only called when there's a real provider response, so the dev
// fallbacks record nothing.

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
