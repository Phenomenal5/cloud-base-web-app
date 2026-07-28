import { Router } from "express";
import { ask } from "../controllers/qaController.js";
import { optionalAuth } from "../middlewares/auth.js";
import { enforceQueryQuota } from "../middlewares/quota.js";

// GET rather than POST because EventSource can only issue a GET.

const router = Router();

/**
 * @openapi
 * /ask:
 *   get:
 *     tags: [Q&A]
 *     summary: Grounded question answering, streamed via Server-Sent Events
 *     description: >
 *       Retrieves the most relevant ASRS reports and streams a grounded answer.
 *       Optional auth (guests may ask, subject to per-IP quota); signed-in users
 *       get a persisted, multi-turn conversation with follow-up rewriting.
 *       Response is `text/event-stream` with events: **meta** (conversationId,
 *       rewrittenQuery, quota) → **sources** → **token** (×N) → **done** | **error**.
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *       - {}
 *     parameters:
 *       - in: query
 *         name: query
 *         required: true
 *         schema: { type: string, maxLength: 500 }
 *         description: The question (max 500 chars)
 *       - in: query
 *         name: conversationId
 *         schema: { type: string, format: uuid }
 *         description: Continue an existing conversation (must be owned by the caller)
 *     responses:
 *       200:
 *         description: SSE stream of the grounded answer
 *         content:
 *           text/event-stream:
 *             schema: { type: string }
 *       422: { $ref: '#/components/responses/ValidationError' }
 *       429: { $ref: '#/components/responses/TooManyRequests' }
 */
router.get("/", optionalAuth, enforceQueryQuota, ask);

export default router;
