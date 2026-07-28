import { Router } from "express";
import { getReport, listReports } from "../controllers/reportController.js";
import { protect, authorize } from "../middlewares/auth.js";

const router = Router();

/**
 * @openapi
 * /reports:
 *   get:
 *     tags: [Reports]
 *     summary: Analyst triage list — filter by category, severity, date range
 *     description: ANALYST or ADMIN only (RBAC). Returns 403 for other roles.
 *     parameters:
 *       - { in: query, name: page, schema: { type: integer, minimum: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, minimum: 1, maximum: 100 } }
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *           enum: [HUMAN_FACTORS, AIRCRAFT_SYSTEMS, WEATHER, ATC_COMMUNICATION, RUNWAY_SAFETY, WILDLIFE, PROCEDURAL, OTHER]
 *       - { in: query, name: severity, schema: { type: string, enum: [LOW, MEDIUM, HIGH] } }
 *       - { in: query, name: from, schema: { type: string, format: date } }
 *       - { in: query, name: to, schema: { type: string, format: date } }
 *     responses:
 *       200:
 *         description: Paginated report list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     reports:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/Report' }
 *                     total: { type: integer }
 *                     page: { type: integer }
 *                     pages: { type: integer }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get("/", protect, authorize("ANALYST", "ADMIN"), listReports);

/**
 * @openapi
 * /reports/{id}:
 *   get:
 *     tags: [Reports]
 *     summary: Report detail with a lazily generated, cached plain-language summary
 *     description: Any signed-in user. Summaries are not available to guests.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: The report
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties: { report: { $ref: '#/components/schemas/Report' } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get("/:id", protect, getReport);

export default router;
