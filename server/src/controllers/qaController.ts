import { catchAsync } from "../utils/catchAsync.js";
import AppError from "../utils/AppError.js";
import { logger } from "../config/logger.js";
import { env } from "../config/env.js";
import { initSse, sendEvent } from "../utils/sse.js";
import { semanticSearch } from "../services/retrievalService.js";
import {
  streamGroundedAnswer,
  resolveQuery,
  streamChatReply,
  type ConversationTurn,
} from "../services/llmService.js";
import {
  createConversation,
  getOwnedConversation,
  getRecentTurns,
  addMessage,
  titleFromMessage,
} from "../services/conversationService.js";
import { logQuery } from "../services/queryLogService.js";
import { clientIp } from "../middlewares/quota.js";

const MAX_QUERY_LENGTH = 500;
const STREAM_FAILURE_MESSAGE = "The answer service is temporarily unavailable. Please try again.";

function logStreamError(error: unknown): void {
  logger.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
}

// ─── GET /api/ask (Server-Sent Events) ────────────────
//
// Mounted behind optionalAuth: signed-in users get a persisted, multi-turn
// conversation, guests get the same answer without one.
// Events: meta -> sources -> token (xN) -> done | error.
export const ask = catchAsync(async (req, res) => {
  const raw = req.query.query ?? req.query.q;
  const query = typeof raw === "string" ? raw.trim() : "";

  // Validate before the stream opens, so these come back as clean JSON errors.
  if (!query) throw new AppError("A query is required.", 422);
  if (query.length > MAX_QUERY_LENGTH) {
    throw new AppError(`Query must be at most ${MAX_QUERY_LENGTH} characters.`, 422);
  }

  const started = Date.now();
  const requestedConversationId =
    typeof req.query.conversationId === "string" ? req.query.conversationId : undefined;

  // Stop generating if the browser goes away, so we don't pay for tokens nobody
  // will read.
  let clientGone = false;
  req.on("close", () => {
    clientGone = true;
  });

  // ── Conversation and history (signed-in users only) ──
  let conversationId: string | undefined;
  let history: ConversationTurn[] = [];

  if (req.user) {
    if (requestedConversationId) {
      // Throws 404 if it isn't theirs.
      const conversation = await getOwnedConversation(req.user.id, requestedConversationId);
      conversationId = conversation.id;
      history = await getRecentTurns(conversationId, env.followupTurns * 2);
    } else {
      const conversation = await createConversation(req.user.id, titleFromMessage(query));
      conversationId = conversation.id;
    }
    // Persist their message now so it survives the stream dropping.
    await addMessage(conversationId, "USER", query);
  }

  // One LLM call decides whether this turn is a real question or small talk, and
  // resolves follow-up references while it's at it. It replaces what used to be a
  // separate rewrite step, so it costs nothing extra on a follow-up.
  const resolved = await resolveQuery(history, query);

  // Persist whatever was streamed, even a partial answer.
  async function persistReply(text: string, citations: Array<{ acn: string; reportId: string }>) {
    if (!conversationId || !text.trim()) return;
    try {
      await addMessage(conversationId, "ASSISTANT", text, citations);
    } catch (error) {
      logStreamError(error);
    }
  }

  // ── Small talk: reply briefly, no retrieval and no citations ──
  // Not logged as a query, so a greeting doesn't cost anyone their daily quota.
  if (resolved.mode === "chat") {
    initSse(res);
    sendEvent(res, "meta", { conversationId, quota: res.locals.quota });
    sendEvent(res, "sources", { count: 0, sources: [] });

    let reply = "";
    try {
      for await (const chunk of streamChatReply(history, query)) {
        if (clientGone) break;
        reply += chunk;
        sendEvent(res, "token", { text: chunk });
      }
      sendEvent(res, "done", { grounded: false, citations: [], conversationId });
    } catch (error) {
      logStreamError(error);
      sendEvent(res, "error", { message: STREAM_FAILURE_MESSAGE });
    } finally {
      await persistReply(reply, []);
      res.end();
    }
    return;
  }

  const searchQuery = resolved.query;
  const rewrittenQuery = searchQuery !== query ? searchQuery : undefined;

  // Retrieve before opening the stream, so a failure here is still clean JSON.
  const hits = await semanticSearch(searchQuery, env.retrievalTopN, env.retrievalMinSimilarity);

  initSse(res);

  sendEvent(res, "meta", { conversationId, rewrittenQuery, quota: res.locals.quota });
  sendEvent(res, "sources", {
    count: hits.length,
    sources: hits.map((hit) => ({
      acn: hit.acn,
      reportId: hit.reportId,
      synopsis: hit.synopsis,
      similarity: hit.similarity,
    })),
  });

  // Nothing relevant in the corpus. Say so rather than let the model invent an
  // answer with no sources behind it.
  if (hits.length === 0) {
    const message = "I couldn't find any relevant reports in the corpus for that question.";
    sendEvent(res, "token", { text: message });
    sendEvent(res, "done", { grounded: false, citations: [], conversationId });
    await persistReply(message, []);
    await logQuery({
      userId: req.user?.id,
      ip: clientIp(req),
      kind: "ASK",
      query,
      rewrittenQuery,
      retrievalCount: 0,
      citedReportIds: [],
      latencyMs: Date.now() - started,
    });
    res.end();
    return;
  }

  const citations = hits.map((hit) => ({ acn: hit.acn, reportId: hit.reportId }));
  let answer = "";

  try {
    for await (const chunk of streamGroundedAnswer(searchQuery, hits)) {
      if (clientGone) break;
      answer += chunk;
      sendEvent(res, "token", { text: chunk });
    }
    sendEvent(res, "done", { grounded: true, citations, conversationId });
  } catch (error) {
    logStreamError(error);
    sendEvent(res, "error", { message: STREAM_FAILURE_MESSAGE });
  } finally {
    await persistReply(answer, citations);
    // The audit trail doubles as the quota counter, so a failure to write it
    // shouldn't take the response down with it.
    try {
      await logQuery({
        userId: req.user?.id,
        ip: clientIp(req),
        kind: "ASK",
        query,
        rewrittenQuery,
        retrievalCount: hits.length,
        citedReportIds: hits.map((hit) => hit.acn),
        latencyMs: Date.now() - started,
      });
    } catch (error) {
      logStreamError(error);
    }
    res.end();
  }
});
