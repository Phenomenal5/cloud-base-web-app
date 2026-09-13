import OpenAI from "openai";
import { createHash } from "node:crypto";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { recordTokenUsage } from "./tokenUsageService.js";

// has to match the vector(1536) column in the schema. change this and you need
// a migration plus a full re-ingest of every report
export const EMBEDDING_DIM = 1536;

const client = env.openaiApiKey ? new OpenAI({ apiKey: env.openaiApiKey }) : null;

let warnedDevFallback = false;

// turn text into vectors, one per input, same order back
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  // no key, so fall back to the fake embeddings below. warn once, not per call
  if (!client) {
    if (!warnedDevFallback) {
      logger.warn(
        "OPENAI_API_KEY not set, using deterministic pseudo-embeddings. Search will not be semantic until you set the key and re-ingest.",
      );
      warnedDevFallback = true;
    }
    return texts.map(devEmbedding);
  }

  const response = await client.embeddings.create({ model: env.embeddingModel, input: texts });
  recordTokenUsage("EMBEDDING", env.embeddingModel, response.usage);

  // sort by the `index` openai puts on each item. don't assume the response
  // comes back in the order we sent it
  return response.data
    .slice()
    .sort((a, b) => a.index - b.index)
    .map((item) => item.embedding);
}

export async function embedQuery(query: string): Promise<number[]> {
  const [vector] = await embedTexts([query]);
  return vector ?? devEmbedding(query);
}

// format a vector the way pgvector wants it: "[0.1,0.2,...]". we need this
// because the embedding column is Unsupported() so it only goes in via raw SQL
export function toVectorLiteral(vector: number[]): string {
  return `[${vector.join(",")}]`;
}

// fake embeddings for local dev
function devEmbedding(text: string): number[] {
  // hash each word into slots, so two texts sharing words end up pointing in a
  // similar direction. enough to exercise pgvector, nowhere near real semantics
  const vector = new Array<number>(EMBEDDING_DIM).fill(0);
  const tokens = text.toLowerCase().split(/\W+/).filter(Boolean);

  for (const token of tokens) {
    const digest = createHash("sha256").update(token).digest();
    for (let index = 0; index < digest.length; index++) {
      const slot = (digest[index]! + index * 31) % EMBEDDING_DIM;
      vector[slot]! += digest[index]! / 255 - 0.5;
    }
  }

  // normalise to unit length, cosine distance expects that
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => value / norm);
}
