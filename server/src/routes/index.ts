import { Router } from "express";
import swaggerUi from "swagger-ui-express";
import { prisma } from "../config/prisma.js";
import { env } from "../config/env.js";
import { swaggerSpec } from "../config/swagger.js";
import { catchAsync } from "../utils/catchAsync.js";
import authRoutes from "./authRoutes.js";
import userRoutes from "./userRoutes.js";
import qaRoutes from "./qaRoutes.js";
import conversationRoutes from "./conversationRoutes.js";
import reportRoutes from "./reportRoutes.js";
import adminRoutes from "./adminRoutes.js";
import notificationRoutes from "./notificationRoutes.js";

// ─── API router ───────────────────────────────────────
//
// Aggregates all feature routers under /api. Feature routers (auth, search,
// conversations, admin…) are mounted here as they're built — keeping this the
// single place that maps URL prefixes to routers.

const router = Router();

// ── API docs (Swagger UI + raw spec) ──────────────────
// Interactive docs at /api/docs, machine-readable spec at /api/docs.json.
// Non-production only — don't publish the full API surface to the internet.
if (!env.isProduction) {
  router.use(
    "/docs",
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, { customSiteTitle: "Nasight API" }),
  );
  router.get("/docs.json", (_req, res) => res.json(swaggerSpec));
}

/**
 * @openapi
 * /health:
 *   get:
 *     tags: [System]
 *     summary: Health & DB readiness probe
 *     security: []
 *     responses:
 *       200:
 *         description: Service healthy and database reachable
 */
// Health / readiness. `SELECT 1` proves the pool can actually reach Postgres,
// so this doubles as a DB readiness probe for the host (Render).
router.get(
  "/health",
  catchAsync(async (_req, res) => {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({
      status: "ok",
      service: "nasight-api",
      db: "up",
      uptime: process.uptime(),
    });
  }),
);

router.use("/auth", authRoutes);
router.use("/users", userRoutes);
router.use("/ask", qaRoutes);
router.use("/conversations", conversationRoutes);
router.use("/reports", reportRoutes);
router.use("/admin", adminRoutes);
router.use("/notifications", notificationRoutes);

export default router;
