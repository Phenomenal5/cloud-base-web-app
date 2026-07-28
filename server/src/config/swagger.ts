import swaggerJsdoc from "swagger-jsdoc";
import { env } from "./env.js";

// Reusable components live here so the per-route @openapi blocks stay short.
// Paths are scanned out of those blocks in the route files.

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.0.3",
    info: {
      title: "Nasight API",
      version: "1.0.0",
      description:
        "Grounded, retrieval-augmented API over NASA ASRS aviation safety reports.\n\n" +
        "**Auth**: a JWT access token in the httpOnly `accessToken` cookie (browser) or an " +
        "`Authorization: Bearer` header (native clients). **Ownership**: user-owned resources " +
        "(conversations, notifications) are scoped to the caller — a non-owned id returns **404**, " +
        "never another user's data (IDOR-safe).",
    },
    servers: [{ url: `http://localhost:${env.port}/api`, description: "Local" }],
    tags: [
      { name: "System", description: "Health & readiness" },
      { name: "Auth", description: "Registration, verification, login, OAuth, password reset" },
      { name: "Q&A", description: "Grounded, streaming question answering" },
      { name: "Conversations", description: "Per-user chat threads (ownership-scoped)" },
      { name: "Reports", description: "Corpus reports, summaries, analyst triage" },
      { name: "Notifications", description: "User notification feed" },
      { name: "Admin", description: "User management, broadcasts, corpus ingestion (ADMIN only)" },
    ],
    components: {
      securitySchemes: {
        cookieAuth: { type: "apiKey", in: "cookie", name: "accessToken" },
        bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      },
      schemas: {
        Error: {
          type: "object",
          properties: {
            status: { type: "string", enum: ["fail", "error"] },
            message: { type: "string" },
          },
        },
        Quota: {
          type: "object",
          nullable: true,
          properties: {
            limit: { type: "integer", nullable: true, description: "null = unlimited (admin)" },
            remaining: { type: "integer", nullable: true },
          },
        },
        User: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            email: { type: "string", format: "email" },
            displayName: { type: "string" },
            role: { type: "string", enum: ["TRAINEE", "ANALYST", "ADMIN"] },
            status: { type: "string", enum: ["ACTIVE", "BLOCKED"] },
            emailVerified: { type: "boolean" },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        TokenPair: {
          type: "object",
          description: "Also set as httpOnly cookies; returned in the body for native clients.",
          properties: {
            accessToken: { type: "string" },
            refreshToken: { type: "string" },
          },
        },
        Citation: {
          type: "object",
          properties: {
            acn: { type: "string" },
            reportId: { type: "string", format: "uuid" },
          },
        },
        Conversation: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            title: { type: "string" },
            pinned: { type: "boolean" },
            archived: { type: "boolean" },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        Message: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            role: { type: "string", enum: ["USER", "ASSISTANT"] },
            content: { type: "string" },
            citations: {
              type: "array",
              nullable: true,
              items: { $ref: "#/components/schemas/Citation" },
            },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        Report: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            acn: { type: "string" },
            synopsis: { type: "string", nullable: true },
            narrative: { type: "string" },
            reportDate: { type: "string", format: "date-time", nullable: true },
            category: {
              type: "string",
              nullable: true,
              enum: [
                "HUMAN_FACTORS",
                "AIRCRAFT_SYSTEMS",
                "WEATHER",
                "ATC_COMMUNICATION",
                "RUNWAY_SAFETY",
                "WILDLIFE",
                "PROCEDURAL",
                "OTHER",
              ],
            },
            severity: { type: "string", nullable: true, enum: ["LOW", "MEDIUM", "HIGH"] },
            severityJustification: { type: "string", nullable: true },
            summary: { type: "string", nullable: true },
          },
        },
        Notification: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            title: { type: "string" },
            body: { type: "string" },
            readAt: { type: "string", format: "date-time", nullable: true },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        IngestionJob: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            filename: { type: "string" },
            status: { type: "string", enum: ["QUEUED", "PROCESSING", "COMPLETED", "FAILED"] },
            totalRows: { type: "integer" },
            reportsIngested: { type: "integer" },
            chunksCreated: { type: "integer" },
            error: { type: "string", nullable: true },
            startedAt: { type: "string", format: "date-time", nullable: true },
            completedAt: { type: "string", format: "date-time", nullable: true },
            createdAt: { type: "string", format: "date-time" },
          },
        },
      },
      responses: {
        BadRequest: {
          description: "Malformed request",
          content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
        },
        Unauthorized: {
          description: "Missing or invalid session",
          content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
        },
        Forbidden: {
          description: "Authenticated but not permitted (role or blocked account)",
          content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
        },
        NotFound: {
          description: "Resource not found (also returned for resources you don't own)",
          content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
        },
        ValidationError: {
          description: "Request failed schema validation",
          content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
        },
        TooManyRequests: {
          description: "Rate limit or daily query quota exceeded",
          content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
        },
      },
    },
    // Endpoints require a session by default; public ones opt out with `security: []`.
    security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  },
  // tsc keeps comments, so the compiled routes still carry the @openapi blocks.
  apis: [env.isProduction ? "./dist/routes/*.js" : "./src/routes/*.ts"],
};

export const swaggerSpec = swaggerJsdoc(options);
