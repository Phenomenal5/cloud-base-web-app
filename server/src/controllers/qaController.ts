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
import { logQuery, dailyLimitFor, usedToday, quotaResetsAt } from "../services/queryLogService.js";
import { clientIp, buildQuotaInfo, type QuotaSnapshot } from "../middlewares/quota.js";

const MAX_QUERY_LENGTH = 500;
const STREAM_FAILURE_MESSAGE = "The answer service is temporarily unavailable. Please try again.";

// =========== Helpers ==============

const logStreamError = (error: unknown): void => {
  logger.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
};

// tell the client what this turn cost them
const sendUsage = (res: Response, consumed: number): void => {
  // this has to go out BEFORE done or error. the browser closes the EventSource
  // the moment it sees either, so anything after lands in a socket nobody reads
  sendEvent(res, "usage", buildQuotaInfo(res.locals.quota as QuotaSnapshot, consumed));
};

// write the audit row, and say whether it counted
const recordQuery = async (entry: Parameters<typeof logQuery>[0]): Promise<number> => {
  try {
    await logQuery(entry);
    return 1;
  } catch (error) {
    // the audit trail doubles as the quota counter, but a failed write here must
    // not kill an answer we already streamed. return 0 so the usage number we
    // report matches what actually made it into the table
    logStreamError(error);
    return 0;
  }
};

// ========== ask a question controller (SSE) ==================
export const ask = catchAsync(async (req, res) => {
  const raw = req.query.query ?? req.query.q;
  const query = typeof raw === "string" ? raw.trim() : "";

  // validate before the stream opens, so these come back as normal JSON errors
  // instead of an error event the browser has to unpack
  if (!query) throw new AppError("A query is required.", 422);
  if (query.length > MAX_QUERY_LENGTH) {
    throw new AppError(`Query must be at most ${MAX_QUERY_LENGTH} characters.`, 422);
  }

  const started = Date.now();
  const requestedConversationId =
    typeof req.query.conversationId === "string" ? req.query.conversationId : undefined;

  // if they close the tab mid-answer, stop generating. no point paying for
  // tokens nobody is going to read
  let clientGone = false;
  req.on("close", () => {
    clientGone = true;
  });

  // signed-in users get a saved thread, guests get the same answer without one
  let conversationId: string | undefined;
  let history: ConversationTurn[] = [];

  if (req.user) {
    if (requestedConversationId) {
      // throws 404 if the thread isn't theirs
      const conversation = await getOwnedConversation(req.user.id, requestedConversationId);
      conversationId = conversation.id;
      history = await getRecentTurns(conversationId, env.followupTurns * 2);
    } else {
      // first message, so start a thread and title it from what they typed
      const conversation = await createConversation(req.user.id, titleFromMessage(query));
      conversationId = conversation.id;
    }

    // save their message now, before any of the slow bits, so it survives the
    // stream dropping halfway
    await addMessage(conversationId, "USER", query);
  }

  // one call decides if this is a real question or just chit-chat, and resolves
  // "what about that one?" into something searchable while it's in there
  const resolved = await resolveQuery(history, query);

  // save whatever we managed to stream, even a half-finished answer
  async function persistReply(text: string, citations: Array<{ acn: string; reportId: string }>) {
    if (!conversationId || !text.trim()) return;
    try {
      await addMessage(conversationId, "ASSISTANT", text, citations);
    } catch (error) {
      logStreamError(error);
    }
  }

  // small talk path: short reply, no retrieval, no citations
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

    // consumed 0, because we never logged it. saying hello must not look like it
    // cost them a question
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

  // only tell the client about the rewrite if it actually rewrote something
  const rewrittenQuery = searchQuery !== query ? searchQuery : undefined;

  // search before opening the stream, same reason as the validation above
  const hits = await semanticSearch(searchQuery, env.retrievalTopN, env.retrievalMinSimilarity);

  initSse(res);

  // sources go out first so the UI can show what we're answering from while the
  // tokens are still arriving
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

  // nothing matched, so say so. letting the model answer with no reports behind
  // it is exactly the thing this whole app is built to avoid
  if (hits.length === 0) {
    const message = "I couldn't find any relevant reports in the corpus for that question.";
    sendEvent(res, "token", { text: message });
    await persistReply(message, []);

    // still counts as a question, they used a search either way
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

  // stream the grounded answer token by token
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

  // usage, then done. order matters, see sendUsage
  sendUsage(res, consumed);
  if (streamFailed) {
    sendEvent(res, "error", { message: STREAM_FAILURE_MESSAGE });
  } else {
    sendEvent(res, "done", { grounded: true, citations, conversationId });
  }
  res.end();
});

// ========= daily usage controller ===============
export const getUsage = catchAsync(async (req, res) => {
  // the composer's dial needs a number on page load, before anything has been
  // asked. signed-in only, a guest's allowance is counted per IP and that's
  // neither theirs to see nor stable enough to put on screen
  const limit = dailyLimitFor(req.user!.role);

  // admins are unlimited, so skip the COUNT(*) entirely for them
  const used = limit === null ? 0 : await usedToday({ userId: req.user!.id });

  res.status(200).json({
    data: {
      usage: buildQuotaInfo({ limit, used, resetsAt: quotaResetsAt() }, 0),
    },
  });
});
