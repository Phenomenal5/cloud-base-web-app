import { prisma } from "../config/prisma.js";
import { catchAsync } from "../utils/catchAsync.js";
import AppError from "../utils/AppError.js";
import { Prisma } from "../generated/prisma/client.js";
import { Role, UserStatus } from "../generated/prisma/enums.js";

// what admins get back. passwordHash is deliberately not in here
const USER_SELECT = {
  id: true,
  email: true,
  displayName: true,
  role: true,
  status: true,
  emailVerified: true,
  createdAt: true,
} as const;

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

// =========== Helpers ==============

// kill every session a user has
const revokeSessions = (userId: string) => {
  // this is what makes a role or status change actually bite. protect never hits
  // the db, so they keep their current access token until it expires. dropping
  // the refresh tokens stops them extending past that
  return prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
};

// ========== list users controller (admin) ==================
export const listUsers = catchAsync(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(req.query.limit) || DEFAULT_LIMIT));
  const skip = (page - 1) * limit;

  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
  const roleParam = req.query.role as string | undefined;
  const statusParam = req.query.status as string | undefined;

  // search hits email and name, and a filter value we don't recognise is just
  // ignored so an old bookmark still returns a list instead of a 422
  const where: Prisma.UserWhereInput = {
    ...(search
      ? {
          OR: [
            { email: { contains: search, mode: "insensitive" } },
            { displayName: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(Object.values(Role).includes(roleParam as Role) ? { role: roleParam as Role } : {}),
    ...(Object.values(UserStatus).includes(statusParam as UserStatus)
      ? { status: statusParam as UserStatus }
      : {}),
  };

  const [users, total] = await prisma.$transaction([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      select: USER_SELECT,
    }),
    prisma.user.count({ where }),
  ]);

  res.status(200).json({ data: { users, page, limit, total, pages: Math.ceil(total / limit) } });
});

// ========= change user role controller (admin) ===============
export const updateUserRole = catchAsync(async (req, res) => {
  const id = req.params.id as string;
  const { role } = req.body as { role: Role };

  // stop an admin demoting themselves. do that as the only admin and nobody can
  // get back in
  if (id === req.user!.id) throw new AppError("You can't change your own role.", 400);

  // read the old role first so we know whether anything actually changed
  const target = await prisma.user.findUnique({ where: { id }, select: { role: true } });
  if (!target) throw new AppError("User not found.", 404);

  const user = await prisma.user.update({ where: { id }, data: { role }, select: USER_SELECT });

  // only sign them out if the role really moved, otherwise a no-op save would
  // boot someone for nothing
  if (target.role !== role) await revokeSessions(id);

  res.status(200).json({ message: "Role updated", data: { user } });
});

// ========== block or unblock controller (admin) ============
export const updateUserStatus = catchAsync(async (req, res) => {
  const id = req.params.id as string;
  const { status } = req.body as { status: UserStatus };

  // same guardrail, don't let an admin block themselves
  if (id === req.user!.id) throw new AppError("You can't change your own status.", 400);

  const target = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  if (!target) throw new AppError("User not found.", 404);

  const user = await prisma.user.update({ where: { id }, data: { status }, select: USER_SELECT });

  // blocking signs them out, unblocking doesn't need to touch their sessions
  if (status === "BLOCKED") await revokeSessions(id);

  res.status(200).json({
    message: status === "BLOCKED" ? "User blocked" : "User unblocked",
    data: { user },
  });
});
