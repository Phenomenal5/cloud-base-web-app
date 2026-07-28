import { prisma } from "../config/prisma.js";
import { catchAsync } from "../utils/catchAsync.js";
import AppError from "../utils/AppError.js";
import { Prisma } from "../generated/prisma/client.js";
import { Role, UserStatus } from "../generated/prisma/enums.js";

// What admins see. Deliberately never passwordHash.
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

// Revoking refresh tokens is how a role or status change actually lands. `protect`
// is stateless, so the user keeps their current access token until it expires;
// killing their refresh tokens means they can't extend past that. This matters
// most for demotion and blocking.
function revokeSessions(userId: string) {
  return prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

// ─── GET /api/admin/users ─────────────────────────────
export const listUsers = catchAsync(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(req.query.limit) || DEFAULT_LIMIT));
  const skip = (page - 1) * limit;

  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
  const roleParam = req.query.role as string | undefined;
  const statusParam = req.query.status as string | undefined;

  // Unrecognized filter values are ignored rather than rejected, so a stale
  // bookmark still returns a list.
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

// ─── PATCH /api/admin/users/:id/role ──────────────────
export const updateUserRole = catchAsync(async (req, res) => {
  const id = req.params.id as string;
  const { role } = req.body as { role: Role };

  // Guardrail against an admin demoting themselves and locking everyone out.
  if (id === req.user!.id) throw new AppError("You can't change your own role.", 400);

  const target = await prisma.user.findUnique({ where: { id }, select: { role: true } });
  if (!target) throw new AppError("User not found.", 404);

  const user = await prisma.user.update({ where: { id }, data: { role }, select: USER_SELECT });
  if (target.role !== role) await revokeSessions(id);

  res.status(200).json({ message: "Role updated", data: { user } });
});

// ─── PATCH /api/admin/users/:id/status ────────────────
export const updateUserStatus = catchAsync(async (req, res) => {
  const id = req.params.id as string;
  const { status } = req.body as { status: UserStatus };

  if (id === req.user!.id) throw new AppError("You can't change your own status.", 400);

  const target = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  if (!target) throw new AppError("User not found.", 404);

  const user = await prisma.user.update({ where: { id }, data: { status }, select: USER_SELECT });
  if (status === "BLOCKED") await revokeSessions(id);

  res.status(200).json({
    message: status === "BLOCKED" ? "User blocked" : "User unblocked",
    data: { user },
  });
});
