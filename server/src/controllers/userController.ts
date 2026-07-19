import { join } from "node:path";
import { unlink } from "node:fs/promises";
import { prisma } from "../config/prisma.js";
import { catchAsync } from "../utils/catchAsync.js";
import AppError from "../utils/AppError.js";
import { logger } from "../config/logger.js";
import { toPublicUser, PUBLIC_USER_SELECT } from "../utils/serializeUser.js";
import { AVATAR_DIR } from "../middlewares/upload.js";

// Best-effort delete of an old avatar file (never blocks the response).
async function removeAvatarFile(filename: string | null): Promise<void> {
  if (!filename) return;
  try {
    await unlink(join(AVATAR_DIR, filename));
  } catch (error) {
    logger.warn(`Could not delete avatar ${filename}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// ─── PATCH /api/users/me ──────────────────────────────
// Update the signed-in user's profile (display name for now).
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
// Multipart field "avatar". multer has already written the file to disk; we save
// the filename and clean up the previous one.
export const uploadUserAvatar = catchAsync(async (req, res) => {
  if (!req.file) throw new AppError("Attach an image in the 'avatar' field.", 400);

  const existing = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { avatarPath: true },
  });

  const user = await prisma.user.update({
    where: { id: req.user!.id },
    data: { avatarPath: req.file.filename },
    select: PUBLIC_USER_SELECT,
  });

  await removeAvatarFile(existing?.avatarPath ?? null);
  res.status(200).json({ message: "Avatar updated", data: { user: toPublicUser(user) } });
});

// ─── DELETE /api/users/me/avatar ──────────────────────
export const deleteUserAvatar = catchAsync(async (req, res) => {
  const existing = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { avatarPath: true },
  });

  const user = await prisma.user.update({
    where: { id: req.user!.id },
    data: { avatarPath: null },
    select: PUBLIC_USER_SELECT,
  });

  await removeAvatarFile(existing?.avatarPath ?? null);
  res.status(200).json({ message: "Avatar removed", data: { user: toPublicUser(user) } });
});
