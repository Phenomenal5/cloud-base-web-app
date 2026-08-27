import type { Response } from "express";
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
import {
  logQuery,
  dailyLimitFor,
  usedToday,
  quotaResetsAt,
} from "../services/queryLogService.js";
import { clientIp, buildQuotaInfo, type QuotaSnapshot } from "../middlewares/quota.js";

const MAX_QUERY_LENGTH = 500;
const STREAM_FAILURE_MESSAGE = "The answer service is temporarily unavailable. Please try again.";

function logStreamError(error: unknown): void {
  logger.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
}

// NOTE: usage has to go out BEFORE done or error. The browser closes the
// EventSource the instant it sees either one, so an event sent after them is
// written into a socket nobody is reading.
function sendUsage(res: Response, consumed: number): void {
  sendEvent(res, "usage", buildQuotaInfo(res.locals.quota as QuotaSnapshot, consumed));
}

// The audit trail doubles as the quota counter, so a failure to write it must not
// take the answer down with it. Returns how many queries were actually charged —
// 0 on failure, so the usage figure we report matches what's really in the table.
async function recordQuery(entry: Parameters<typeof logQuery>[0]): Promise<number> {
  try {
    await logQuery(entry);
    return 1;
  } catch (error) {
    logStreamError(error);
    return 0;
  }
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
    sendEvent(res, "meta", { conversationId });
    sendEvent(res, "sources", { count: 0, sources: [] });

    let reply = "";
    let streamFailed = false;
    try {
      for await (const chunk of streamChatReply(history, query)) {
        if (clientGone) break;
        reply += chunk;
        sendEvent(res, "token", { text: chunk });
      }
    } catch (error) {
      streamFailed = true;
      logStreamError(error);
    }

    await persistReply(reply, []);
    // Nothing was logged, so nothing was consumed. Reporting the unchanged
    // figure is the whole point: a greeting must not look like a spent question.
    sendUsage(res, 0);
    if (streamFailed) {
      sendEvent(res, "error", { message: STREAM_FAILURE_MESSAGE });
    } else {
      sendEvent(res, "done", { grounded: false, citations: [], conversationId });
    }
    res.end();
    return;
  }

  const searchQuery = resolved.query;
  const rewrittenQuery = searchQuery !== query ? searchQuery : undefined;

  // Retrieve before opening the stream, so a failure here is still clean JSON.
  const hits = await semanticSearch(searchQuery, env.retrievalTopN, env.retrievalMinSimilarity);

  initSse(res);

  sendEvent(res, "meta", { conversationId, rewrittenQuery });
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
    await persistReply(message, []);
    const consumed = await recordQuery({
      userId: req.user?.id,
      ip: clientIp(req),
      kind: "ASK",
      query,
      rewrittenQuery,
      retrievalCount: 0,
      citedReportIds: [],
      latencyMs: Date.now() - started,
    });
    sendUsage(res, consumed);
    sendEvent(res, "done", { grounded: false, citations: [], conversationId });
    res.end();
    return;
  }

  const citations = hits.map((hit) => ({ acn: hit.acn, reportId: hit.reportId }));
  let answer = "";
  let streamFailed = false;

  try {
    for await (const chunk of streamGroundedAnswer(searchQuery, hits)) {
      if (clientGone) break;
      answer += chunk;
      sendEvent(res, "token", { text: chunk });
    }
  } catch (error) {
    streamFailed = true;
    logStreamError(error);
  }

  await persistReply(answer, citations);
  const consumed = await recordQuery({
    userId: req.user?.id,
    ip: clientIp(req),
    kind: "ASK",
    query,
    rewrittenQuery,
    retrievalCount: hits.length,
    citedReportIds: hits.map((hit) => hit.acn),
    latencyMs: Date.now() - started,
  });

  sendUsage(res, consumed);
  if (streamFailed) {
    sendEvent(res, "error", { message: STREAM_FAILURE_MESSAGE });
  } else {
    sendEvent(res, "done", { grounded: true, citations, conversationId });
  }
  res.end();
});

// ─── GET /api/ask/usage ───────────────────────────────
//
// Backs the chat composer's usage indicator, which needs a figure on page load,
// before any question has been asked. Signed-in only: a guest's allowance is
// counted per IP, which is neither theirs to see nor stable enough to show.
export const getUsage = catchAsync(async (req, res) => {
  const limit = dailyLimitFor(req.user!.role);
  // Admins are unlimited, so there's nothing worth a COUNT(*) for them.
  const used = limit === null ? 0 : await usedToday({ userId: req.user!.id });

  res.status(200).json({
    data: {
      usage: buildQuotaInfo({ limit, used, resetsAt: quotaResetsAt() }, 0),
    },
  });
});
