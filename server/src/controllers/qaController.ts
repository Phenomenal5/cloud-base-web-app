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

// ─── GET /api/ask?query=…&conversationId=… (SSE) ──────
//
// Grounded Q&A streamed as Server-Sent Events (FR-22/23/24). Mounted behind
// optionalAuth: signed-in users get a persisted, multi-turn conversation with
// follow-up rewriting (FR-28); guests get the same answer, statelessly.
//
// Events: meta → sources → token(×N) → done | error.
export const ask = catchAsync(async (req, res) => {
  const raw = req.query.query ?? req.query.q;
  const query = typeof raw === "string" ? raw.trim() : "";

  // Validate up front — thrown before the stream opens → clean JSON error.
  if (!query) throw new AppError("A query is required.", 422);
  if (query.length > 500) throw new AppError("Query must be at most 500 characters.", 422);

  const started = Date.now();
  const conversationIdParam =
    typeof req.query.conversationId === "string" ? req.query.conversationId : undefined;

  // ── Conversation + history (signed-in users only) ──
  let conversationId: string | undefined;
  let history: ConversationTurn[] = [];

  if (req.user) {
    if (conversationIdParam) {
      const conversation = await getOwnedConversation(req.user.id, conversationIdParam); // 404 if not owned
      conversationId = conversation.id;
      history = await getRecentTurns(conversationId, env.followupTurns * 2);
    } else {
      const conversation = await createConversation(req.user.id, titleFromMessage(query));
      conversationId = conversation.id;
    }
    // Persist the user's message now so it survives an SSE drop.
    await addMessage(conversationId, "USER", query);
  }

  // ── Understand the turn: real question (→ search) or small talk (→ chat) ──
  // One LLM call decides, so greetings/thanks/acknowledgements end the exchange
  // naturally instead of triggering a grounded answer. This resolves follow-up
  // references too (FR-28) — it replaces the old rewrite step.
  const resolved = await resolveQuery(history, query);

  // ── Conversational turn → short LLM reply, no retrieval / citations / cost ──
  // Not logged as a query, so chit-chat doesn't burn the daily quota.
  if (resolved.mode === "chat") {
    let clientGone = false;
    req.on("close", () => {
      clientGone = true;
    });

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
      logger.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
      sendEvent(res, "error", {
        message: "The answer service is temporarily unavailable. Please try again.",
      });
    } finally {
      // Persist the assistant reply (even partial, on an SSE drop).
      if (conversationId && reply.trim()) {
        try {
          await addMessage(conversationId, "ASSISTANT", reply, []);
        } catch (persistError) {
          logger.error(persistError instanceof Error ? persistError.message : String(persistError));
        }
      }
      res.end();
    }
    return;
  }

  const searchQuery = resolved.query;

  // ── Retrieve BEFORE opening the stream (errors stay clean JSON) ──
  const hits = await semanticSearch(searchQuery, env.retrievalTopN, env.retrievalMinSimilarity);

  initSse(res);

  // meta: conversationId (so the client can continue the thread) + the rewritten
  // query when it differs (auditability, PRD §10.4).
  sendEvent(res, "meta", {
    conversationId,
    rewrittenQuery: searchQuery !== query ? searchQuery : undefined,
    quota: res.locals.quota,
  });

  sendEvent(res, "sources", {
    count: hits.length,
    sources: hits.map((hit) => ({
      acn: hit.acn,
      reportId: hit.reportId,
      synopsis: hit.synopsis,
      similarity: hit.similarity,
    })),
  });

  // No relevant reports → say so, never fabricate (FR-24).
  if (hits.length === 0) {
    const message = "I couldn't find any relevant reports in the corpus for that question.";
    sendEvent(res, "token", { text: message });
    sendEvent(res, "done", { grounded: false, citations: [], conversationId });
    if (conversationId) await addMessage(conversationId, "ASSISTANT", message, []);
    await logQuery({
      userId: req.user?.id,
      ip: clientIp(req),
      kind: "ASK",
      query,
      rewrittenQuery: searchQuery !== query ? searchQuery : undefined,
      retrievalCount: 0,
      citedReportIds: [],
      latencyMs: Date.now() - started,
    });
    res.end();
    return;
  }

  // Stop generating if the client disconnects — don't waste LLM tokens.
  let clientGone = false;
  req.on("close", () => {
    clientGone = true;
  });

  const citations = hits.map((hit) => ({ acn: hit.acn, reportId: hit.reportId }));
  let full = "";

  try {
    for await (const chunk of streamGroundedAnswer(searchQuery, hits)) {
      if (clientGone) break;
      full += chunk;
      sendEvent(res, "token", { text: chunk });
    }
    sendEvent(res, "done", { grounded: true, citations, conversationId });
  } catch (error) {
    logger.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
    sendEvent(res, "error", {
      message: "The answer service is temporarily unavailable. Please try again.",
    });
  } finally {
    // Persist the assistant message (even partial, on an SSE drop) — PRD §13 risk
    // mitigation: server-side completion still writes the final message to the DB.
    if (conversationId && full.trim()) {
      try {
        await addMessage(conversationId, "ASSISTANT", full, citations);
      } catch (persistError) {
        logger.error(persistError instanceof Error ? persistError.message : String(persistError));
      }
    }
    // Audit + quota counter (FR-33).
    try {
      await logQuery({
        userId: req.user?.id,
        ip: clientIp(req),
        kind: "ASK",
        query,
        rewrittenQuery: searchQuery !== query ? searchQuery : undefined,
        retrievalCount: hits.length,
        citedReportIds: hits.map((hit) => hit.acn),
        latencyMs: Date.now() - started,
      });
    } catch (logError) {
      logger.error(logError instanceof Error ? logError.message : String(logError));
    }
    res.end();
  }
});
