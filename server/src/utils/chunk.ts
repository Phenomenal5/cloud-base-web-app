import { env } from "../config/env.js";

// Split a narrative into overlapping windows for embedding. Token count is
// approximated by characters (~4 chars/token). We prefer to cut on a sentence
// boundary so chunks read cleanly, and overlap keeps context across the seams.
export function chunkText(
  text: string,
  maxChars: number = env.chunkMaxChars,
  overlapChars: number = env.chunkOverlapChars,
): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  if (clean.length <= maxChars) return [clean];

  const chunks: string[] = [];
  let start = 0;

  while (start < clean.length) {
    let end = Math.min(start + maxChars, clean.length);

    // Only accept a sentence break in the back half of the window, otherwise a
    // short first sentence would produce tiny chunks.
    if (end < clean.length) {
      const boundary = clean.lastIndexOf(". ", end);
      if (boundary > start + maxChars * 0.5) end = boundary + 1;
    }

    const piece = clean.slice(start, end).trim();
    if (piece) chunks.push(piece);

    if (end >= clean.length) break;
    start = Math.max(end - overlapChars, start + 1); // the +1 guards against no progress
  }

  return chunks;
}
