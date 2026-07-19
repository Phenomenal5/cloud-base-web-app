import OpenAI from "openai";
import { createHash } from "node:crypto";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { recordTokenUsage } from "./tokenUsageService.js";

// ─── Embedding service ────────────────────────────────
//
// Turns text into vectors for pgvector storage + similarity search. Uses OpenAI
// when OPENAI_API_KEY is set; otherwise a deterministic dev fallback so the
// ingestion + retrieval pipeline is exercisable locally without a key.
//
// EMBEDDING_DIM MUST match the schema's vector(1536) column. Changing the model
// to one with a different dimension requires a schema migration + re-ingesting.

export const EMBEDDING_DIM = 1536;

const client = env.openaiApiKey ? new OpenAI({ apiKey: env.openaiApiKey }) : null;

let warnedDevFallback = false;

// Embed a batch of texts → one vector per input, order preserved.
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  if (!client) {
    if (!warnedDevFallback) {
      logger.warn(
        "[embeddings:dev] OPENAI_API_KEY not set — using deterministic pseudo-embeddings (not semantic). Set the key and re-ingest for real search.",
      );
      warnedDevFallback = true;
    }
    return texts.map(devEmbedding);
  }

  const response = await client.embeddings.create({ model: env.embeddingModel, input: texts });
  recordTokenUsage("EMBEDDING", env.embeddingModel, response.usage);
  // OpenAI returns items with an `index`; sort to be safe before mapping.
  return response.data
    .slice()
    .sort((a, b) => a.index - b.index)
    .map((item) => item.embedding);
}

export async function embedQuery(query: string): Promise<number[]> {
  const [vector] = await embedTexts([query]);
  return vector ?? devEmbedding(query);
}

// Format a vector as a pgvector literal: "[0.1,0.2,...]". Used when writing/reading
// the Unsupported() column via raw SQL.
export function toVectorLiteral(vector: number[]): string {
  return `[${vector.join(",")}]`;
}

// ─── Dev fallback ─────────────────────────────────────
// Deterministic, unit-normalized pseudo-embedding derived from word hashes. It
// carries crude lexical signal (shared words → closer vectors) — enough to
// exercise pgvector, NOT a substitute for real embeddings.
function devEmbedding(text: string): number[] {
  const vector = new Array<number>(EMBEDDING_DIM).fill(0);
  const tokens = text.toLowerCase().split(/\W+/).filter(Boolean);

  for (const token of tokens) {
    const digest = createHash("sha256").update(token).digest();
    for (let i = 0; i < digest.length; i++) {
      const slot = (digest[i]! + i * 31) % EMBEDDING_DIM;
      vector[slot]! += digest[i]! / 255 - 0.5;
    }
  }

  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => value / norm);
}
