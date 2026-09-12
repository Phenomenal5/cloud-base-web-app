import { Router } from "express";
import { listNotifications, markAllRead, markRead } from "../controllers/notificationController.js";
import { protect } from "../middlewares/auth.js";

// A signed-in user's own notification feed.

const router = Router();

router.use(protect);

/**
 * @openapi
 * /notifications:
 *   get:
 *     tags: [Notifications]
 *     summary: The caller's notifications + unread count
 *     responses:
 *       200:
 *         description: Notifications and unread count
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     notifications:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/Notification' }
 *                     unread: { type: integer }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get("/", listNotifications);

/**
 * @openapi
 * /notifications/read-all:
 *   patch:
 *     tags: [Notifications]
 *     summary: Mark all of the caller's notifications read
 *     responses:
 *       200: { description: Marked read (count returned) }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
// Declared before /:id/read so "read-all" is never matched as an id.
router.patch("/read-all", markAllRead);

/**
 * @openapi
 * /notifications/{id}/read:
 *   patch:
 *     tags: [Notifications]
 *     summary: Mark one notification read
 *     description: Ownership-scoped, a notification you don't own returns 404.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Marked read }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.patch("/:id/read", markRead);

export default router;
