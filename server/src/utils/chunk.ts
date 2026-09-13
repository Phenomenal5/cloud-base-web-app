import { env } from "../config/env.js";

// cut a narrative into overlapping windows to embed. we count characters rather
// than tokens (roughly 4 chars a token), cut on sentence ends where we can so
// the chunks read properly, and overlap them so meaning isn't lost at the seams
export function chunkText(
  text: string,
  maxChars: number = env.chunkMaxChars,
  overlapChars: number = env.chunkOverlapChars,
): string[] {
  // flatten the whitespace first, ASRS narratives are full of odd line breaks
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];

  // short enough to be one chunk
  if (clean.length <= maxChars) return [clean];

  const chunks: string[] = [];
  let start = 0;

  while (start < clean.length) {
    let end = Math.min(start + maxChars, clean.length);

    // only take a sentence break if it's in the back half of the window. accept
    // any of them and one short opening sentence gives you a tiny chunk
    if (end < clean.length) {
      const boundary = clean.lastIndexOf(". ", end);
      if (boundary > start + maxChars * 0.5) end = boundary + 1;
    }

    const piece = clean.slice(start, end).trim();
    if (piece) chunks.push(piece);

    if (end >= clean.length) break;
    // step back by the overlap. the +1 is a guard, without it a pathological
    // input can leave start where it was and spin forever
    start = Math.max(end - overlapChars, start + 1);
  }

  return chunks;
}
