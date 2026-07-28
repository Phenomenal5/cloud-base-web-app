/* eslint-disable no-console -- this is a CLI script, console is its output. */
import "dotenv/config";
import OpenAI from "openai";

// Smoke test for OPENAI_API_KEY: one tiny chat completion and one embedding, the
// two model families the app actually uses. Reads server/.env directly and never
// boots the app or the database.
//
//   npm run test:model

const apiKey = process.env.OPENAI_API_KEY?.trim();
const chatModel = process.env.CHAT_MODEL?.trim() || "gpt-4o-mini";
const embeddingModel = process.env.EMBEDDING_MODEL?.trim() || "text-embedding-3-small";

// Enough to tell which key is loaded, never the secret itself.
function maskKey(key: string): string {
  if (key.length <= 12) return "sk-...";
  return `${key.slice(0, 6)}...${key.slice(-4)}`;
}

// The status codes here are the ones that actually come up, and they mean very
// different things, so name them rather than printing a raw error.
function describeError(error: unknown): string {
  const status = (error as { status?: number }).status;
  const message = error instanceof Error ? error.message : String(error);
  if (status === 401) return "401 Unauthorized: the API key is invalid or revoked.";
  if (status === 429) return "429: rate limited or out of quota. The key is valid but unfunded.";
  if (status === 404) return "404: model not found or not enabled for this account.";
  return `${status ? `${status}: ` : ""}${message}`;
}

async function main(): Promise<void> {
  if (!apiKey) {
    console.error("OPENAI_API_KEY is not set in server/.env, nothing to test.");
    process.exit(1);
  }

  console.log(`Testing OpenAI key ${maskKey(apiKey)}`);
  console.log(`  chat model:      ${chatModel}`);
  console.log(`  embedding model: ${embeddingModel}\n`);

  const client = new OpenAI({ apiKey });
  let failed = false;

  try {
    const startedAt = Date.now();
    const completion = await client.chat.completions.create({
      model: chatModel,
      // NOTE: max_completion_tokens, not max_tokens. Newer models reject the
      // latter, and this one works on gpt-4o-mini too. The headroom is so a
      // reasoning model doesn't spend the whole budget before replying.
      max_completion_tokens: 50,
      messages: [{ role: "user", content: "Reply with the single word: pong" }],
    });
    const reply = completion.choices[0]?.message?.content?.trim() ?? "";
    console.log(`chat.completions OK (${Date.now() - startedAt}ms), reply: "${reply}"`);
    console.log(`  tokens used: ${completion.usage?.total_tokens ?? "?"}\n`);
  } catch (error) {
    failed = true;
    console.error(`chat.completions FAILED: ${describeError(error)}\n`);
  }

  try {
    const startedAt = Date.now();
    const embedding = await client.embeddings.create({
      model: embeddingModel,
      input: "Nasight embedding smoke test.",
    });
    const dimensions = embedding.data[0]?.embedding.length ?? 0;
    // A mismatch here means the vector column in the schema won't accept it.
    const note = dimensions === 1536 ? "" : "  WARNING: expected 1536 to match the schema";
    console.log(`embeddings OK (${Date.now() - startedAt}ms), ${dimensions} dimensions${note}`);
    console.log(`  tokens used: ${embedding.usage?.total_tokens ?? "?"}\n`);
  } catch (error) {
    failed = true;
    console.error(`embeddings FAILED: ${describeError(error)}\n`);
  }

  if (failed) {
    console.error("Result: the key did not pass, see the errors above.");
    process.exit(1);
  }
  console.log("Result: the key works for both chat and embeddings.");
}

main().catch((error) => {
  console.error(`Unexpected failure: ${error instanceof Error ? error.stack : String(error)}`);
  process.exit(1);
});
