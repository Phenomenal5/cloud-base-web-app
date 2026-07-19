import { Router } from "express";
import {
  listUsers,
  updateUserRole,
  updateUserStatus,
} from "../controllers/adminUserController.js";
import { broadcastNotification } from "../controllers/notificationController.js";
import {
  uploadIngestion,
  listIngestions,
  getIngestion,
} from "../controllers/ingestionController.js";
import { getMetrics } from "../controllers/adminMetricsController.js";
import { protect, authorize } from "../middlewares/auth.js";
import { validate } from "../middlewares/validate.js";
import { uploadCsv } from "../middlewares/upload.js";
import { updateRoleSchema, updateStatusSchema } from "../validators/adminSchemas.js";
import { broadcastSchema } from "../validators/notificationSchemas.js";

// ─── /api/admin ───────────────────────────────────────
// Everything here is ADMIN-only (RBAC, FR-9). protect → authorize once for all.

const router = Router();

router.use(protect, authorize("ADMIN"));

// Dashboard metrics
router.get("/metrics", getMetrics);

/**
 * @openapi
 * /admin/users:
 *   get:
 *     tags: [Admin]
 *     summary: List users (search by email/name, filter by role/status)
 *     parameters:
 *       - { in: query, name: search, schema: { type: string } }
 *       - { in: query, name: role, schema: { type: string, enum: [TRAINEE, ANALYST, ADMIN] } }
 *       - { in: query, name: status, schema: { type: string, enum: [ACTIVE, BLOCKED] } }
 *       - { in: query, name: page, schema: { type: integer } }
 *       - { in: query, name: limit, schema: { type: integer } }
 *     responses:
 *       200:
 *         description: Paginated users
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     users: { type: array, items: { $ref: '#/components/schemas/User' } }
 *                     total: { type: integer }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get("/users", listUsers);

/**
 * @openapi
 * /admin/users/{id}/role:
 *   patch:
 *     tags: [Admin]
 *     summary: Change a user's role
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [role]
 *             properties: { role: { type: string, enum: [TRAINEE, ANALYST, ADMIN] } }
 *     responses:
 *       200: { description: Role updated }
 *       400: { description: Can't change your own role }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.patch("/users/:id/role", validate(updateRoleSchema), updateUserRole);

/**
 * @openapi
 * /admin/users/{id}/status:
 *   patch:
 *     tags: [Admin]
 *     summary: Block or unblock a user (blocking revokes their sessions)
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties: { status: { type: string, enum: [ACTIVE, BLOCKED] } }
 *     responses:
 *       200: { description: Status updated }
 *       400: { description: Can't change your own status }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.patch("/users/:id/status", validate(updateStatusSchema), updateUserStatus);

/**
 * @openapi
 * /admin/notifications:
 *   post:
 *     tags: [Admin]
 *     summary: Broadcast a notification to all users
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, body]
 *             properties:
 *               title: { type: string, maxLength: 120 }
 *               body: { type: string, maxLength: 1000 }
 *     responses:
 *       201: { description: Broadcast sent (recipient count returned) }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       422: { $ref: '#/components/responses/ValidationError' }
 */
router.post("/notifications", validate(broadcastSchema), broadcastNotification);

/**
 * @openapi
 * /admin/ingestions:
 *   post:
 *     tags: [Admin]
 *     summary: Upload an ASRS CSV for background ingestion
 *     description: Returns 202 immediately; the worker processes the job off the request path.
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file]
 *             properties:
 *               file: { type: string, format: binary, description: CSV with ACN + narrative columns }
 *     responses:
 *       202:
 *         description: Job queued
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties: { job: { $ref: '#/components/schemas/IngestionJob' } }
 *       400: { description: No file, or no valid rows }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *   get:
 *     tags: [Admin]
 *     summary: List recent ingestion jobs
 *     responses:
 *       200:
 *         description: Ingestion jobs
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     jobs: { type: array, items: { $ref: '#/components/schemas/IngestionJob' } }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.post("/ingestions", uploadCsv, uploadIngestion);
router.get("/ingestions", listIngestions);

/**
 * @openapi
 * /admin/ingestions/{id}:
 *   get:
 *     tags: [Admin]
 *     summary: Ingestion job status (poll for queued/processing/completed/failed)
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200:
 *         description: The job
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties: { job: { $ref: '#/components/schemas/IngestionJob' } }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get("/ingestions/:id", getIngestion);

export default router;
