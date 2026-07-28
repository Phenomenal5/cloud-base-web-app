import { prisma } from "../config/prisma.js";
import AppError from "../utils/AppError.js";
import type { MessageRole } from "../generated/prisma/enums.js";
import type { ConversationTurn } from "./llmService.js";

// Every read and write here is scoped to a userId, so one user can never reach
// another's threads.

const MAX_TITLE_LENGTH = 60;

// Derived from the first message. Cheap and deterministic; an LLM-generated
// title would be nicer but isn't worth a call per conversation.
export function titleFromMessage(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= MAX_TITLE_LENGTH ? clean : `${clean.slice(0, MAX_TITLE_LENGTH - 3)}…`;
}

export async function createConversation(userId: string, title: string) {
  return prisma.conversation.create({ data: { userId, title } });
}

// 404 rather than 403, so this doesn't confirm that someone else's conversation
// exists.
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
  // Bump updatedAt so the sidebar sorts by recent activity.
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { updatedAt: new Date() },
  });
  return message;
}

// The last N turns, oldest first, for follow-up context.
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
