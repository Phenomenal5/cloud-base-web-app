import { prisma } from "../config/prisma.js";
import { catchAsync } from "../utils/catchAsync.js";
import AppError from "../utils/AppError.js";

const FEED_LIMIT = 50;

// ========== notification feed controller ==============
export const listNotifications = catchAsync(async (req, res) => {
  const userId = req.user!.id;

  // feed and unread count in one transaction, so the bell badge can't disagree
  // with the list it drops down
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

// ========= mark all as read controller ===============
export const markAllRead = catchAsync(async (req, res) => {
  // only their own unread ones, already-read rows keep their original timestamp
  const result = await prisma.notification.updateMany({
    where: { userId: req.user!.id, readAt: null },
    data: { readAt: new Date() },
  });
  res
    .status(200)
    .json({ message: "All notifications marked read", data: { updated: result.count } });
});

// ========== mark one as read controller ============
export const markRead = catchAsync(async (req, res) => {
  // scope it to the owner. someone else's id then matches nothing and gets a 404
  // instead of confirming the notification is real
  const result = await prisma.notification.updateMany({
    where: { id: req.params.id as string, userId: req.user!.id },
    data: { readAt: new Date() },
  });
  if (result.count === 0) throw new AppError("Notification not found.", 404);
  res.status(200).json({ message: "Notification marked read" });
});

// ========= broadcast to everyone controller (admin) ==============
export const broadcastNotification = catchAsync(async (req, res) => {
  const { title, body } = req.body as { title: string; body: string };

  // one INSERT ... SELECT rather than pulling every user id into node first.
  // single round trip, and memory doesn't grow with the user table.
  //
  // the ::text cast matters, `id` is a TEXT column because prisma makes the uuids
  // client side, and postgres won't put a uuid in it without the cast
  const recipients = await prisma.$executeRaw`
    INSERT INTO notifications (id, "userId", title, body)
    SELECT gen_random_uuid()::text, u.id, ${title}, ${body}
    FROM users u
  `;

  // nothing inserted means there were no users at all
  if (recipients === 0) throw new AppError("There are no users to notify.", 400);

  res.status(201).json({
    message: `Notification broadcast to ${recipients} user(s).`,
    data: { recipients },
  });
});
