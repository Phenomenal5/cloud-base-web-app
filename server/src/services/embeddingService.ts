import OpenAI from "openai";
import { createHash } from "node:crypto";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { recordTokenUsage } from "./tokenUsageService.js";

// Text to vectors for pgvector storage and similarity search. EMBEDDING_DIM must
// match the schema's vector(1536) column; changing it needs a full re-ingest.
export const EMBEDDING_DIM = 1536;

const client = env.openaiApiKey ? new OpenAI({ apiKey: env.openaiApiKey }) : null;

let warnedDevFallback = false;

// One vector per input, order preserved.
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

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
  // The API returns each item with its own `index`; sort by it rather than
  // assuming response order matches the input.
  return response.data
    .slice()
    .sort((a, b) => a.index - b.index)
    .map((item) => item.embedding);
}

export async function embedQuery(query: string): Promise<number[]> {
  const [vector] = await embedTexts([query]);
  return vector ?? devEmbedding(query);
}

// pgvector literal format: "[0.1,0.2,...]". Needed because the embedding column
// is Unsupported() and can only be written through raw SQL.
export function toVectorLiteral(vector: number[]): string {
  return `[${vector.join(",")}]`;
}

// Deterministic, unit-normalized vector derived from word hashes. Shared words
// pull two texts closer, which is enough crude signal to exercise pgvector, but
// it is not a substitute for real embeddings.
function devEmbedding(text: string): number[] {
  const vector = new Array<number>(EMBEDDING_DIM).fill(0);
  const tokens = text.toLowerCase().split(/\W+/).filter(Boolean);

  for (const token of tokens) {
    const digest = createHash("sha256").update(token).digest();
    for (let index = 0; index < digest.length; index++) {
      const slot = (digest[index]! + index * 31) % EMBEDDING_DIM;
      vector[slot]! += digest[index]! / 255 - 0.5;
    }
  }

  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => value / norm);
}
