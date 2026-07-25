/* eslint-disable no-console -- this is a CLI script; console IS its output. */
import "dotenv/config";
import OpenAI from "openai";

// ─── OpenAI key / model smoke test ────────────────────
//
// Verifies OPENAI_API_KEY works end-to-end with one tiny chat completion and one
// embedding — the two model families the app actually uses. It names the failure
// modes that matter so you know exactly what to fix:
//   • no key set            → nothing to test
//   • 401 Unauthorized      → key is invalid/revoked
//   • 429                   → key is valid but rate-limited or out of quota (unfunded)
//   • 404                   → model name not available to this account
//
// Self-contained: reads server/.env directly, never boots the app or the DB.
//
// Run from the server/ folder:
//   npx tsx scripts/test-model.ts     (or: npm run test:model)

const apiKey = process.env.OPENAI_API_KEY?.trim();
const chatModel = process.env.CHAT_MODEL?.trim() || "gpt-4o-mini";
const embeddingModel = process.env.EMBEDDING_MODEL?.trim() || "text-embedding-3-small";

// Show just enough to identify which key is loaded — never the secret itself.
function maskKey(key: string): string {
  if (key.length <= 12) return "sk-…";
  return `${key.slice(0, 6)}…${key.slice(-4)}`;
}

// Turn an OpenAI/SDK error into a single readable line with the right diagnosis.
function describeError(error: unknown): string {
  const status = (error as { status?: number }).status;
  const message = error instanceof Error ? error.message : String(error);
  if (status === 401) return `401 Unauthorized — the API key is invalid or revoked.`;
  if (status === 429) return `429 — rate limited or out of quota (key is valid but unfunded / over limit).`;
  if (status === 404) return `404 — model not found or not enabled for this account.`;
  return `${status ? `${status} — ` : ""}${message}`;
}

async function main(): Promise<void> {
  if (!apiKey) {
    console.error("✖ OPENAI_API_KEY is not set in server/.env — nothing to test.");
    process.exit(1);
  }

  console.log(`Testing OpenAI key ${maskKey(apiKey)}`);
  console.log(`  chat model:      ${chatModel}`);
  console.log(`  embedding model: ${embeddingModel}\n`);

  const client = new OpenAI({ apiKey });
  let failed = false;

  // 1) Chat completion — the smallest possible request.
  try {
    const startedAt = Date.now();
    const completion = await client.chat.completions.create({
      model: chatModel,
      // Newer models (gpt-5.x / o-series) reject `max_tokens` and require
      // `max_completion_tokens`; it also works on gpt-4o-mini, so it's the
      // portable choice. Extra headroom so reasoning models don't spend the whole
      // budget before emitting a reply.
      max_completion_tokens: 50,
      messages: [{ role: "user", content: "Reply with the single word: pong" }],
    });
    const reply = completion.choices[0]?.message?.content?.trim() ?? "";
    console.log(`✔ chat.completions OK (${Date.now() - startedAt}ms) — reply: "${reply}"`);
    console.log(`  tokens used: ${completion.usage?.total_tokens ?? "?"}\n`);
  } catch (error) {
    failed = true;
    console.error(`✖ chat.completions FAILED — ${describeError(error)}\n`);
  }

  // 2) Embedding — what the RAG retrieval pipeline depends on (expects 1536 dims).
  try {
    const startedAt = Date.now();
    const embedding = await client.embeddings.create({
      model: embeddingModel,
      input: "Nasight embedding smoke test.",
    });
    const dimensions = embedding.data[0]?.embedding.length ?? 0;
    const dimensionNote = dimensions === 1536 ? "" : "  ⚠ expected 1536 for the schema's vector column";
    console.log(`✔ embeddings OK (${Date.now() - startedAt}ms) — ${dimensions} dimensions${dimensionNote}`);
    console.log(`  tokens used: ${embedding.usage?.total_tokens ?? "?"}\n`);
  } catch (error) {
    failed = true;
    console.error(`✖ embeddings FAILED — ${describeError(error)}\n`);
  }

  if (failed) {
    console.error("Result: ✖ the key did NOT pass — see the error(s) above.");
    process.exit(1);
  }
  console.log("Result: ✔ OpenAI key works for both chat and embeddings.");
}

main().catch((error) => {
  console.error(`Unexpected failure: ${error instanceof Error ? error.stack : String(error)}`);
  process.exit(1);
});
