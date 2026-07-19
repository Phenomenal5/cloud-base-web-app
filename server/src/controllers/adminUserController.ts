import { prisma } from "../config/prisma.js";
import { catchAsync } from "../utils/catchAsync.js";
import AppError from "../utils/AppError.js";
import { Prisma } from "../generated/prisma/client.js";
import { Role, UserStatus } from "../generated/prisma/enums.js";

// Fields exposed to admins (never passwordHash).
const USER_SELECT = {
  id: true,
  email: true,
  displayName: true,
  role: true,
  status: true,
  emailVerified: true,
  createdAt: true,
} as const;

// ─── GET /api/admin/users ─────────────────────────────
// Paginated, searchable (email/name), filterable by role/status. ADMIN only.
export const listUsers = catchAsync(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const skip = (page - 1) * limit;

  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
  const roleParam = req.query.role as string | undefined;
  const statusParam = req.query.status as string | undefined;

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

  // Guardrail: an admin can't change their own role (avoids self-lockout).
  if (id === req.user!.id) throw new AppError("You can't change your own role.", 400);

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) throw new AppError("User not found.", 404);

  const user = await prisma.user.update({ where: { id }, data: { role }, select: USER_SELECT });

  // Revoke the target's sessions so the new role takes effect on their next
  // request instead of lingering until the current access token expires (the
  // stateless-protect trade-off). Critical for demotion — a demoted admin/analyst
  // must lose elevated access promptly; on `refresh` they re-read the DB role.
  if (target.role !== role) {
    await prisma.refreshToken.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  res.status(200).json({ message: "Role updated", data: { user } });
});

// ─── PATCH /api/admin/users/:id/status ────────────────
// Block/unblock. On block, revoke the user's refresh tokens so they're locked
// out within one access-token lifetime (the stateless-protect trade-off).
export const updateUserStatus = catchAsync(async (req, res) => {
  const id = req.params.id as string;
  const { status } = req.body as { status: UserStatus };

  if (id === req.user!.id) throw new AppError("You can't change your own status.", 400);

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) throw new AppError("User not found.", 404);

  const user = await prisma.user.update({ where: { id }, data: { status }, select: USER_SELECT });

  if (status === "BLOCKED") {
    await prisma.refreshToken.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  res.status(200).json({
    message: status === "BLOCKED" ? "User blocked" : "User unblocked",
    data: { user },
  });
});
