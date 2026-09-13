import { prisma } from "../config/prisma.js";
import AppError from "../utils/AppError.js";
import type { MessageRole } from "../generated/prisma/enums.js";
import type { ConversationTurn } from "./llmService.js";

// everything in here is scoped by userId, so nobody can reach another user's
// threads even with a valid id

const MAX_TITLE_LENGTH = 60;

// title a thread from its first message. an LLM could write a nicer one but
// that's a whole extra call per conversation for not much
export function titleFromMessage(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= MAX_TITLE_LENGTH ? clean : `${clean.slice(0, MAX_TITLE_LENGTH - 3)}…`;
}

export async function createConversation(userId: string, title: string) {
  return prisma.conversation.create({ data: { userId, title } });
}

// fetch a thread, but only if it belongs to them. 404 not 403, a 403 would
// confirm someone else's conversation exists
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
  // touch the parent so the sidebar sorts this thread back to the top
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { updatedAt: new Date() },
  });
  return message;
}

// the last few turns, for answering follow-ups
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

  // query is newest-first so we get the *recent* ones, flip it back so the model
  // reads the conversation in order
  return messages.reverse().map((message) => ({ role: message.role, content: message.content }));
}
