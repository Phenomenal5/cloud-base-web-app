import multer from "multer";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { mkdirSync } from "node:fs";
import AppError from "../utils/AppError.js";

// ========== csv upload for ingestion ==================
// memory storage, not disk. the API and the worker are separate processes with
// no shared filesystem, so the text gets saved onto the IngestionJob row instead
export const uploadCsv = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    const isCsv =
      file.mimetype === "text/csv" ||
      file.mimetype === "application/vnd.ms-excel" ||
      file.originalname.toLowerCase().endsWith(".csv");
    if (isCsv) callback(null, true);
    else callback(new AppError("Only CSV files are accepted.", 400));
  },
}).single("file");

// ========== avatar upload ============
// these do go to disk and get served statically, we only keep the filename

export const AVATAR_DIR = resolve("uploads/avatars");
mkdirSync(AVATAR_DIR, { recursive: true });

// no SVG on purpose. an SVG can carry inline <script>, and we serve avatars off
// our own origin, so opening one would run it. the extension comes from this map
// rather than the uploaded filename, so nobody can sneak a .svg through either
const AVATAR_MIME_EXTENSIONS: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

const avatarStorage = multer.diskStorage({
  destination: (_req, _file, callback) => callback(null, AVATAR_DIR),
  // random uuid for the name, so nothing the client sent reaches the filesystem
  filename: (_req, file, callback) => {
    callback(null, `${randomUUID()}${AVATAR_MIME_EXTENSIONS[file.mimetype] ?? ".jpg"}`);
  },
});

export const uploadAvatar = multer({
  storage: avatarStorage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    // mimetype comes from the client, so this keeps out SVG and obvious junk but
    // proves nothing about the actual bytes. a magic-number check is the next step
    if (file.mimetype in AVATAR_MIME_EXTENSIONS) callback(null, true);
    else callback(new AppError("Upload a PNG, JPG, WEBP, or GIF image.", 400));
  },
}).single("avatar");
