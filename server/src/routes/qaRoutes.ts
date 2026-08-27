import { Router } from "express";
import { ask, getUsage } from "../controllers/qaController.js";
import { optionalAuth, protect } from "../middlewares/auth.js";
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
 *       rewrittenQuery) → **sources** → **token** (×N) → **usage** → **done** | **error**.
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
/**
 * @openapi
 * /ask/usage:
 *   get:
 *     tags: [Q&A]
 *     summary: The caller's daily query usage
 *     description: >
 *       Today's usage against the caller's daily allowance, for the chat UI's
 *       usage indicator. Signed-in only — guests are counted per IP, which isn't
 *       shown. `limit`, `remaining` and `percentUsed` are all `null` for admins,
 *       who are unlimited.
 *     responses:
 *       200:
 *         description: Current usage
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     usage:
 *                       type: object
 *                       properties:
 *                         limit: { type: integer, nullable: true, example: 30 }
 *                         used: { type: integer, example: 12 }
 *                         remaining: { type: integer, nullable: true, example: 18 }
 *                         percentUsed: { type: integer, nullable: true, example: 40 }
 *                         resetsAt: { type: string, format: date-time, nullable: true }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
// NOTE: declared before "/" only for readability — Express matches on the full
// path, so the order of these two doesn't actually matter.
router.get("/usage", protect, getUsage);

router.get("/", optionalAuth, enforceQueryQuota, ask);

export default router;
