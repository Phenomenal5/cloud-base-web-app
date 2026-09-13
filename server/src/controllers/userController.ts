import { join } from "node:path";
import { unlink } from "node:fs/promises";
import { prisma } from "../config/prisma.js";
import { catchAsync } from "../utils/catchAsync.js";
import AppError from "../utils/AppError.js";
import { logger } from "../config/logger.js";
import { toPublicUser, PUBLIC_USER_SELECT } from "../utils/serializeUser.js";
import { AVATAR_DIR } from "../middlewares/upload.js";

// =========== Helpers ==============

// delete an old avatar off disk
const removeAvatarFile = async (filename: string | null): Promise<void> => {
  if (!filename) return;
  try {
    await unlink(join(AVATAR_DIR, filename));
  } catch (error) {
    // just log it. a leftover file is untidy, not worth failing the request over
    logger.warn(
      `Could not delete avatar ${filename}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};

// point the user at a new avatar and bin the old one
const replaceAvatar = async (userId: string, filename: string | null) => {
  // grab the current filename before we overwrite it
  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { avatarPath: true },
  });

  const user = await prisma.user.update({
    where: { id: userId },
    data: { avatarPath: filename },
    select: PUBLIC_USER_SELECT,
  });

  // db is updated, so now the old file is safe to delete
  await removeAvatarFile(existing?.avatarPath ?? null);
  return user;
};

// ========== update profile controller ==============
export const updateProfile = catchAsync(async (req, res) => {
  const { displayName } = req.body as { displayName: string };

  // only the display name is editable here. email and role live elsewhere
  const user = await prisma.user.update({
    where: { id: req.user!.id },
    data: { displayName },
    select: PUBLIC_USER_SELECT,
  });
  res.status(200).json({ message: "Profile updated", data: { user: toPublicUser(user) } });
});

// ========= upload avatar controller ===============
export const uploadUserAvatar = catchAsync(async (req, res) => {
  // multer already saved the file, so all that's left is recording the name
  if (!req.file) throw new AppError("Attach an image in the 'avatar' field.", 400);

  const user = await replaceAvatar(req.user!.id, req.file.filename);
  res.status(200).json({ message: "Avatar updated", data: { user: toPublicUser(user) } });
});

// ========== remove avatar controller ============
export const deleteUserAvatar = catchAsync(async (req, res) => {
  // null filename means back to the default avatar
  const user = await replaceAvatar(req.user!.id, null);
  res.status(200).json({ message: "Avatar removed", data: { user: toPublicUser(user) } });
});
