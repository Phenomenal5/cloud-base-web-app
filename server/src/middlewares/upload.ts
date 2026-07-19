import multer from "multer";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { mkdirSync } from "node:fs";
import AppError from "../utils/AppError.js";

// ─── CSV upload (admin ingestion) ─────────────────────
//
// In-memory storage — the API and worker are separate processes with no shared
// disk, so the file is read into a buffer here and its text persisted on the
// IngestionJob row for the worker to pick up.

export const uploadCsv = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, callback) => {
    const isCsv =
      file.mimetype === "text/csv" ||
      file.mimetype === "application/vnd.ms-excel" ||
      file.originalname.toLowerCase().endsWith(".csv");
    if (isCsv) callback(null, true);
    else callback(new AppError("Only CSV files are accepted.", 400));
  },
}).single("file");

// ─── Avatar upload (profile picture) ──────────────────
//
// Disk storage — the file is saved under uploads/avatars/ and served statically;
// only the generated filename is persisted on the user row.

export const AVATAR_DIR = resolve("uploads/avatars");
mkdirSync(AVATAR_DIR, { recursive: true });

// Raster image types only. NOTE: SVG is deliberately EXCLUDED — it can carry
// inline <script>/onload handlers and, since avatars are served from our own
// origin, opening one directly would execute that script (stored XSS). We also
// derive the stored extension from this map, never from the client-supplied
// filename, so a crafted originalname can't smuggle a `.svg`/`.html` extension.
const AVATAR_MIME_EXTENSIONS: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

const avatarStorage = multer.diskStorage({
  destination: (_req, _file, callback) => callback(null, AVATAR_DIR),
  filename: (_req, file, callback) => {
    const extension = AVATAR_MIME_EXTENSIONS[file.mimetype] ?? ".jpg";
    callback(null, `${randomUUID()}${extension}`);
  },
});

export const uploadAvatar = multer({
  storage: avatarStorage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB
  fileFilter: (_req, file, callback) => {
    // mimetype is client-supplied, so this is necessary-but-not-sufficient; a
    // magic-byte check would be the belt-and-braces follow-up. It does reject
    // SVG and non-image types outright.
    if (file.mimetype in AVATAR_MIME_EXTENSIONS) callback(null, true);
    else callback(new AppError("Upload a PNG, JPG, WEBP, or GIF image.", 400));
  },
}).single("avatar");
