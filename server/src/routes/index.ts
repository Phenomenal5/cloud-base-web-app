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

// the one place that maps a URL prefix to a router

const router = Router();

// docs at /api/docs, raw spec at /api/docs.json. off in production, no reason
// to publish the whole API surface to the internet
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
// SELECT 1 proves the pool can actually reach postgres, so this works as a real
// readiness probe instead of just saying the process is up
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
