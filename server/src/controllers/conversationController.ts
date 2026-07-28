import { prisma } from "../config/prisma.js";
import { Prisma } from "../generated/prisma/client.js";
import { catchAsync } from "../utils/catchAsync.js";
import { getOwnedConversation } from "../services/conversationService.js";

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

// ─── GET /api/conversations ───────────────────────────
// Pinned first, then most recently active. ?search= matches titles and message
// content; archived threads are hidden unless ?archived=true.
export const listConversations = catchAsync(async (req, res) => {
  // Clamped so a user with thousands of threads can't pull them all at once.
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(req.query.limit) || DEFAULT_LIMIT));
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
// Rename, pin, or archive. Only the fields present in the body change.
export const updateConversation = catchAsync(async (req, res) => {
  const id = req.params.id as string;
  await getOwnedConversation(req.user!.id, id);

  const { title, pinned, archived } = req.body as {
    title?: string;
    pinned?: boolean;
    archived?: boolean;
  };

  const conversation = await prisma.conversation.update({
    where: { id },
    data: { title, pinned, archived },
  });

  res.status(200).json({ message: "Conversation updated", data: { conversation } });
});

// ─── DELETE /api/conversations/:id ────────────────────
// Cascades to the messages.
export const deleteConversation = catchAsync(async (req, res) => {
  const id = req.params.id as string;
  await getOwnedConversation(req.user!.id, id);
  await prisma.conversation.delete({ where: { id } });
  res.status(200).json({ message: "Conversation deleted" });
});
