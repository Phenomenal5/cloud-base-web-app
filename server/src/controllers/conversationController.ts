import { prisma } from "../config/prisma.js";
import { Prisma } from "../generated/prisma/client.js";
import { catchAsync } from "../utils/catchAsync.js";
import { getOwnedConversation } from "../services/conversationService.js";

// ─── GET /api/conversations ───────────────────────────
// The signed-in user's conversations. Excludes archived unless ?archived=true.
// ?search= matches conversation titles AND message content. Pinned first, then
// most recently active.
export const listConversations = catchAsync(async (req, res) => {
  // Clamp pagination so a user with thousands of threads can't pull them all in
  // one response. The sidebar shows the most recent page (pinned first).
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30));
  const skip = (page - 1) * limit;

  const includeArchived = req.query.archived === "true";
  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";

  const where: Prisma.ConversationWhereInput = {
    userId: req.user!.id,
    ...(includeArchived ? {} : { archived: false }),
    ...(search
      ? {
          OR: [
            { title: { contains: search, mode: "insensitive" } },
            { messages: { some: { content: { contains: search, mode: "insensitive" } } } },
          ],
        }
      : {}),
  };

  const [conversations, total] = await prisma.$transaction([
    prisma.conversation.findMany({
      where,
      orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
      skip,
      take: limit,
      select: {
        id: true,
        title: true,
        pinned: true,
        archived: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { messages: true } },
      },
    }),
    prisma.conversation.count({ where }),
  ]);

  res.status(200).json({
    data: { conversations, page, limit, total, pages: Math.ceil(total / limit) },
  });
});

// ─── GET /api/conversations/:id ───────────────────────
// One conversation with its messages (oldest → newest).
export const getConversation = catchAsync(async (req, res) => {
  const conversation = await getOwnedConversation(req.user!.id, req.params.id as string);

  const messages = await prisma.message.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, role: true, content: true, citations: true, createdAt: true },
  });

  res.status(200).json({ data: { conversation, messages } });
});

// ─── PATCH /api/conversations/:id ─────────────────────
// Rename / pin / archive (FR-27). Only the provided fields change.
export const updateConversation = catchAsync(async (req, res) => {
  await getOwnedConversation(req.user!.id, req.params.id as string); // ownership check
  const { title, pinned, archived } = req.body as {
    title?: string;
    pinned?: boolean;
    archived?: boolean;
  };

  const conversation = await prisma.conversation.update({
    where: { id: req.params.id as string },
    data: { title, pinned, archived },
  });

  res.status(200).json({ message: "Conversation updated", data: { conversation } });
});

// ─── DELETE /api/conversations/:id ────────────────────
// Cascades to messages (FR-27 delete; PRD §8.2 users can delete own conversations).
export const deleteConversation = catchAsync(async (req, res) => {
  await getOwnedConversation(req.user!.id, req.params.id as string);
  await prisma.conversation.delete({ where: { id: req.params.id as string } });
  res.status(200).json({ message: "Conversation deleted" });
});
