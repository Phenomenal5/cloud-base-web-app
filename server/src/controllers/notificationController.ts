import { prisma } from "../config/prisma.js";
import { catchAsync } from "../utils/catchAsync.js";
import AppError from "../utils/AppError.js";

const FEED_LIMIT = 50;

// ─── GET /api/notifications ───────────────────────────
// The caller's own feed plus the unread count, so the bell badge and the list
// can never disagree.
export const listNotifications = catchAsync(async (req, res) => {
  const userId = req.user!.id;

  const [notifications, unread] = await prisma.$transaction([
    prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: FEED_LIMIT,
    }),
    prisma.notification.count({ where: { userId, readAt: null } }),
  ]);

  res.status(200).json({ data: { notifications, unread } });
});

// ─── PATCH /api/notifications/read-all ────────────────
export const markAllRead = catchAsync(async (req, res) => {
  const result = await prisma.notification.updateMany({
    where: { userId: req.user!.id, readAt: null },
    data: { readAt: new Date() },
  });
  res
    .status(200)
    .json({ message: "All notifications marked read", data: { updated: result.count } });
});

// ─── PATCH /api/notifications/:id/read ────────────────
export const markRead = catchAsync(async (req, res) => {
  // Scoped to the owner, so someone else's id simply matches nothing and gets a
  // 404 rather than confirming the notification exists.
  const result = await prisma.notification.updateMany({
    where: { id: req.params.id as string, userId: req.user!.id },
    data: { readAt: new Date() },
  });
  if (result.count === 0) throw new AppError("Notification not found.", 404);
  res.status(200).json({ message: "Notification marked read" });
});

// ─── POST /api/admin/notifications (ADMIN) ────────────
// Fans one row out to every user.
export const broadcastNotification = catchAsync(async (req, res) => {
  const { title, body } = req.body as { title: string; body: string };

  // NOTE: done as INSERT ... SELECT rather than reading every user id into the
  // API process first. It's one round trip and its memory use doesn't grow with
  // the user table.
  //
  // The ::text cast matters: `id` is a TEXT column (Prisma generates uuids in
  // the client), and Postgres won't assign a uuid to it without one. createdAt
  // is left out because the column already defaults to CURRENT_TIMESTAMP.
  const recipients = await prisma.$executeRaw`
    INSERT INTO notifications (id, "userId", title, body)
    SELECT gen_random_uuid()::text, u.id, ${title}, ${body}
    FROM users u
  `;

  if (recipients === 0) throw new AppError("There are no users to notify.", 400);

  res.status(201).json({
    message: `Notification broadcast to ${recipients} user(s).`,
    data: { recipients },
  });
});
