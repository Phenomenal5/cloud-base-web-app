import { prisma } from "../config/prisma.js";
import { Prisma } from "../generated/prisma/client.js";
import { catchAsync } from "../utils/catchAsync.js";
import { getOwnedConversation } from "../services/conversationService.js";

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

// ========== list conversations controller ==================
export const listConversations = catchAsync(async (req, res) => {
  // clamp the paging so nobody with thousands of threads can pull them all at once
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(req.query.limit) || DEFAULT_LIMIT));
  const skip = (page - 1) * limit;

  const includeArchived = req.query.archived === "true";
  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";

  // build the filter: always their own threads, archived hidden unless asked for,
  // and ?search= looks in the title and inside the messages
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

  // rows and total count together so the page count matches what we just returned
  const [conversations, total] = await prisma.$transaction([
    prisma.conversation.findMany({
      where,
      // pinned ones float to the top, then whatever was used most recently
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

// ========= open one conversation controller ===============
export const getConversation = catchAsync(async (req, res) => {
  // throws 404 if it isn't theirs, so no extra ownership check below
  const conversation = await getOwnedConversation(req.user!.id, req.params.id as string);

  // oldest first, that's the order the chat renders in
  const messages = await prisma.message.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, role: true, content: true, citations: true, createdAt: true },
  });

  res.status(200).json({ data: { conversation, messages } });
});

// ========== rename pin or archive controller ============
export const updateConversation = catchAsync(async (req, res) => {
  const id = req.params.id as string;

  // check it's theirs before touching anything
  await getOwnedConversation(req.user!.id, id);

  const { title, pinned, archived } = req.body as {
    title?: string;
    pinned?: boolean;
    archived?: boolean;
  };

  // undefined fields are skipped by prisma, so only what they sent changes
  const conversation = await prisma.conversation.update({
    where: { id },
    data: { title, pinned, archived },
  });

  res.status(200).json({ message: "Conversation updated", data: { conversation } });
});

// ========= delete conversation controller ==============
export const deleteConversation = catchAsync(async (req, res) => {
  const id = req.params.id as string;
  await getOwnedConversation(req.user!.id, id);

  // the messages go with it, the schema cascades on delete
  await prisma.conversation.delete({ where: { id } });
  res.status(200).json({ message: "Conversation deleted" });
});
