import multer from "multer";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { mkdirSync } from "node:fs";
import AppError from "../utils/AppError.js";

// ─── CSV upload (admin ingestion) ─────────────────────
// Kept in memory: the API and the worker are separate processes with no shared
// disk, so the text is persisted on the IngestionJob row for the worker to read.
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

// ─── Avatar upload ────────────────────────────────────
// Written to disk and served statically; only the generated filename is stored.

export const AVATAR_DIR = resolve("uploads/avatars");
mkdirSync(AVATAR_DIR, { recursive: true });

// SVG is excluded: it can carry inline <script>, and avatars are served from our
// own origin, so opening one would run it (stored XSS). The extension comes from
// this map, not the client filename, so originalname can't smuggle one in.
const AVATAR_MIME_EXTENSIONS: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

const avatarStorage = multer.diskStorage({
  destination: (_req, _file, callback) => callback(null, AVATAR_DIR),
  filename: (_req, file, callback) => {
    callback(null, `${randomUUID()}${AVATAR_MIME_EXTENSIONS[file.mimetype] ?? ".jpg"}`);
  },
});

export const uploadAvatar = multer({
  storage: avatarStorage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    // The mimetype is client-supplied, so this rejects SVG and non-images but
    // isn't proof of content. A magic-byte check would be the next step.
    if (file.mimetype in AVATAR_MIME_EXTENSIONS) callback(null, true);
    else callback(new AppError("Upload a PNG, JPG, WEBP, or GIF image.", 400));
  },
}).single("avatar");
