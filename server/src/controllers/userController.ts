import { join } from "node:path";
import { unlink } from "node:fs/promises";
import { prisma } from "../config/prisma.js";
import { catchAsync } from "../utils/catchAsync.js";
import AppError from "../utils/AppError.js";
import { logger } from "../config/logger.js";
import { toPublicUser, PUBLIC_USER_SELECT } from "../utils/serializeUser.js";
import { AVATAR_DIR } from "../middlewares/upload.js";

// Best effort: a leftover file on disk shouldn't fail the request.
async function removeAvatarFile(filename: string | null): Promise<void> {
  if (!filename) return;
  try {
    await unlink(join(AVATAR_DIR, filename));
  } catch (error) {
    logger.warn(
      `Could not delete avatar ${filename}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

// Swap the stored filename and clean up whatever it replaced.
async function replaceAvatar(userId: string, filename: string | null) {
  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { avatarPath: true },
  });

  const user = await prisma.user.update({
    where: { id: userId },
    data: { avatarPath: filename },
    select: PUBLIC_USER_SELECT,
  });

  await removeAvatarFile(existing?.avatarPath ?? null);
  return user;
}

// ─── PATCH /api/users/me ──────────────────────────────
export const updateProfile = catchAsync(async (req, res) => {
  const { displayName } = req.body as { displayName: string };
  const user = await prisma.user.update({
    where: { id: req.user!.id },
    data: { displayName },
    select: PUBLIC_USER_SELECT,
  });
  res.status(200).json({ message: "Profile updated", data: { user: toPublicUser(user) } });
});

// ─── PUT /api/users/me/avatar ─────────────────────────
// multer has already written the file; we only record its name.
export const uploadUserAvatar = catchAsync(async (req, res) => {
  if (!req.file) throw new AppError("Attach an image in the 'avatar' field.", 400);

  const user = await replaceAvatar(req.user!.id, req.file.filename);
  res.status(200).json({ message: "Avatar updated", data: { user: toPublicUser(user) } });
});

// ─── DELETE /api/users/me/avatar ──────────────────────
export const deleteUserAvatar = catchAsync(async (req, res) => {
  const user = await replaceAvatar(req.user!.id, null);
  res.status(200).json({ message: "Avatar removed", data: { user: toPublicUser(user) } });
});
