import { prisma } from "../config/prisma.js";
import AppError from "../utils/AppError.js";
import type { MessageRole } from "../generated/prisma/enums.js";
import type { ConversationTurn } from "./llmService.js";

// ─── Conversation service ─────────────────────────────
//
// Ownership-checked helpers for conversations + messages. Every read/write is
// scoped to a userId so one user can never touch another's threads.

// Derive a title from the first user message (FR-26). Cheap and deterministic;
// an LLM-generated title is a future nicety.
export function titleFromMessage(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= 60 ? clean : `${clean.slice(0, 57)}…`;
}

export async function createConversation(userId: string, title: string) {
  return prisma.conversation.create({ data: { userId, title } });
}

// Fetch a conversation the user owns, or throw 404 (don't reveal others exist).
export async function getOwnedConversation(userId: string, conversationId: string) {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, userId },
  });
  if (!conversation) throw new AppError("Conversation not found.", 404);
  return conversation;
}

export async function addMessage(
  conversationId: string,
  role: MessageRole,
  content: string,
  citations?: unknown,
) {
  const message = await prisma.message.create({
    data: {
      conversationId,
      role,
      content,
      citations: citations === undefined ? undefined : (citations as object),
    },
  });
  // Bump the conversation's updatedAt so lists sort by recent activity.
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { updatedAt: new Date() },
  });
  return message;
}

// The last N turns (oldest → newest) for follow-up rewriting / context.
export async function getRecentTurns(
  conversationId: string,
  limit: number,
): Promise<ConversationTurn[]> {
  const messages = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { role: true, content: true },
  });
  return messages.reverse().map((message) => ({ role: message.role, content: message.content }));
}
