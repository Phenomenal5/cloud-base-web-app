import { Router } from "express";
import {
  listConversations,
  getConversation,
  updateConversation,
  deleteConversation,
} from "../controllers/conversationController.js";
import { protect } from "../middlewares/auth.js";
import { validate } from "../middlewares/validate.js";
import { updateConversationSchema } from "../validators/conversationSchemas.js";

// Conversations are per-user, so every route here needs a session.

const router = Router();

router.use(protect);

/**
 * @openapi
 * /conversations:
 *   get:
 *     tags: [Conversations]
 *     summary: List the caller's conversations (pinned first, then recent)
 *     parameters:
 *       - in: query
 *         name: archived
 *         schema: { type: boolean }
 *         description: Include archived conversations
 *     responses:
 *       200:
 *         description: The user's conversations with message counts
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     conversations:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/Conversation' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get("/", listConversations);

/**
 * @openapi
 * /conversations/{id}:
 *   get:
 *     tags: [Conversations]
 *     summary: Get one conversation with its messages
 *     description: Ownership-scoped — a conversation you don't own returns 404 (IDOR-safe).
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Conversation + messages
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     conversation: { $ref: '#/components/schemas/Conversation' }
 *                     messages:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/Message' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get("/:id", getConversation);

/**
 * @openapi
 * /conversations/{id}:
 *   patch:
 *     tags: [Conversations]
 *     summary: Rename, pin, or archive a conversation
 *     description: Ownership-scoped — non-owned id returns 404.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title: { type: string, maxLength: 120 }
 *               pinned: { type: boolean }
 *               archived: { type: boolean }
 *     responses:
 *       200: { description: Updated conversation }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       422: { $ref: '#/components/responses/ValidationError' }
 */
router.patch("/:id", validate(updateConversationSchema), updateConversation);

/**
 * @openapi
 * /conversations/{id}:
 *   delete:
 *     tags: [Conversations]
 *     summary: Delete a conversation (cascades to messages)
 *     description: Ownership-scoped — non-owned id returns 404.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Deleted }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.delete("/:id", deleteConversation);

export default router;
