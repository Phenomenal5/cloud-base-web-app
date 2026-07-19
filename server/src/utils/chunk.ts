import { env } from "../config/env.js";

// ─── Narrative chunking ───────────────────────────────
//
// Split a long narrative into overlapping ~200–500 token windows for embedding
// accuracy (PRD §11.4). Token count is approximated by characters (~4 chars/token).
// Prefers to cut on a sentence boundary so chunks read cleanly; falls back to a
// hard character cut. Overlap preserves context across chunk edges.

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

    // Try to end on a sentence boundary within the back half of the window.
    if (end < clean.length) {
      const boundary = clean.lastIndexOf(". ", end);
      if (boundary > start + maxChars * 0.5) end = boundary + 1;
    }

    const piece = clean.slice(start, end).trim();
    if (piece) chunks.push(piece);

    if (end >= clean.length) break;
    start = Math.max(end - overlapChars, start + 1); // guard against no-progress
  }

  return chunks;
}
