/* eslint-disable no-console -- diagnostic CLI script, console is its output. */
import { prisma } from "../src/config/prisma.js";

// runs the exact query GET /api/conversations/:id uses, straight against the
// real database, and prints everything back. written while chasing whether the
// API was quietly dropping messages
//
//   npx tsx scripts/check-conversation-messages.ts

async function main(): Promise<void> {
  // busiest threads first, or the check tells you nothing
  const conversations = await prisma.conversation.findMany({
    select: {
      id: true,
      title: true,
      userId: true,
      _count: { select: { messages: true } },
    },
    orderBy: { messages: { _count: "desc" } },
    take: 10,
  });

  if (conversations.length === 0) {
    console.log("No conversations in the database yet.");
    return;
  }

  console.log("Conversations by message count (top 10):");
  for (const conversation of conversations) {
    console.log(
      `  ${conversation.id}  msgs=${conversation._count.messages}  "${conversation.title}"`,
    );
  }

  const target = conversations[0]!;

  // same query conversationController.getConversation runs
  const messages = await prisma.message.findMany({
    where: { conversationId: target.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, role: true, content: true, citations: true, createdAt: true },
  });

  console.log(
    `\nGET /conversations/${target.id} returns ${messages.length} message(s), ` +
      `_count says ${target._count.messages}. These should match.\n`,
  );
  messages.forEach((message, index) => {
    const preview = message.content.replace(/\s+/g, " ").slice(0, 70);
    console.log(
      `  [${String(index + 1).padStart(2)}] ${message.role.padEnd(9)} ` +
        `${message.createdAt.toISOString()}  ${preview}`,
    );
  });
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
