import { prisma } from "../config/prisma.js";
import { catchAsync } from "../utils/catchAsync.js";
import AppError from "../utils/AppError.js";

// ─── GET /api/notifications ───────────────────────────
// The signed-in user's notifications (newest first) + unread count.
export const listNotifications = catchAsync(async (req, res) => {
  const userId = req.user!.id;

  const [notifications, unread] = await prisma.$transaction([
    prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 50,
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
  res.status(200).json({ message: "All notifications marked read", data: { updated: result.count } });
});

// ─── PATCH /api/notifications/:id/read ────────────────
export const markRead = catchAsync(async (req, res) => {
  const id = req.params.id as string;
  // Scoped to the owner — someone else's id simply matches nothing.
  const result = await prisma.notification.updateMany({
    where: { id, userId: req.user!.id },
    data: { readAt: new Date() },
  });
  if (result.count === 0) throw new AppError("Notification not found.", 404);
  res.status(200).json({ message: "Notification marked read" });
});

// ─── POST /api/admin/notifications (ADMIN) ────────────
// Broadcast a notification to every user (FR-32) by fanning out one row each.
export const broadcastNotification = catchAsync(async (req, res) => {
  const { title, body } = req.body as { title: string; body: string };

  const users = await prisma.user.findMany({ select: { id: true } });
  if (users.length === 0) throw new AppError("There are no users to notify.", 400);

  await prisma.notification.createMany({
    data: users.map((user) => ({ userId: user.id, title, body })),
  });

  res.status(201).json({
    message: `Notification broadcast to ${users.length} user(s).`,
    data: { recipients: users.length },
  });
});
