import "dotenv/config";

// ─── Environment configuration ────────────────────────
//
// Validate config at boot and fail fast & loud, rather than 500-ing on the
// first request that needs a missing var. As features land (auth, RAG), add
// their keys here — required at boot means "the server can't run without it".

type NodeEnv = "development" | "production" | "test";

// Read a required var; exit the process if it's missing/blank.
function need(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    // eslint-disable-next-line no-console -- logger isn't up yet; this is a boot failure
    console.error(`✖ Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value;
}

// Read an optional var, falling back to a default.
function opt(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.trim() ? value : fallback;
}

const nodeEnv = opt("NODE_ENV", "development") as NodeEnv;
const port = Number(opt("PORT", "4000"));

export const env = {
  nodeEnv,
  isProduction: nodeEnv === "production",
  isTest: nodeEnv === "test",
  port,

  // CLI/migrate reads this via prisma.config.ts; the pg driver adapter reads it
  // at runtime (see config/prisma.ts). Standard postgresql:// URL (Neon/Supabase).
  databaseUrl: need("DATABASE_URL"),

  // Background queue (pg-boss). Prefer a DIRECT (non-pooled) Postgres URL —
  // pg-boss relies on session features that transaction poolers (Neon's -pooler,
  // PgBouncer) don't support. Falls back to DATABASE_URL.
  queueDatabaseUrl: opt("QUEUE_DATABASE_URL", need("DATABASE_URL")),

  // Externally reachable origin of this server (no /api) — used to build absolute
  // URLs for statically served files like avatars (/uploads/...).
  publicBaseUrl: opt("PUBLIC_BASE_URL", `http://localhost:${port}`),

  // ── Auth ────────────────────────────────────────────
  // Secret for signing short-lived access-token JWTs. Required — the server
  // can't safely issue sessions without it.
  jwtAccessSecret: need("JWT_ACCESS_SECRET"),
  // TTLs kept as plain numbers (seconds / days) to avoid ms-string typing quirks
  // and to feed cookie maxAge directly.
  jwtAccessTtlSeconds: Number(opt("JWT_ACCESS_TTL_SECONDS", "900")), // 15 minutes
  refreshTtlDays: Number(opt("REFRESH_TTL_DAYS", "30")),

  // ── Email (Brevo SMTP relay) ────────────────────────
  // Sent via SMTP (nodemailer) through Brevo's relay. Optional at boot: without
  // BREVO_SMTP_USER/BREVO_SMTP_KEY, emailService logs codes to the console so the
  // flow is testable in dev. BREVO_SMTP_USER is the SMTP login (…@smtp-brevo.com);
  // BREVO_SMTP_KEY is the Brevo "SMTP key" (dashboard → SMTP & API → SMTP) — NOT
  // your login password and NOT the HTTP API key (xkeysib-…).
  smtpHost: opt("BREVO_SMTP_HOST", "smtp-relay.brevo.com"),
  smtpPort: Number(opt("BREVO_SMTP_PORT", "587")),
  smtpUser: opt("BREVO_SMTP_USER", ""),
  smtpPass: opt("BREVO_SMTP_KEY", ""),
  emailFrom: opt("EMAIL_FROM", "no-reply@nasight.app"),
  emailFromName: opt("EMAIL_FROM_NAME", "Nasight"),
  verificationCodeTtlMinutes: Number(opt("VERIFICATION_CODE_TTL_MINUTES", "15")),
  passwordResetTtlMinutes: Number(opt("PASSWORD_RESET_TTL_MINUTES", "15")),

  // ── AI / embeddings ─────────────────────────────────
  // Optional at boot: without a key, embeddingService uses a deterministic dev
  // fallback so the pipeline runs. Real semantic search needs the key.
  openaiApiKey: opt("OPENAI_API_KEY", ""),
  embeddingModel: opt("EMBEDDING_MODEL", "text-embedding-3-small"),
  // Chunking: target ~400 tokens (~4 chars/token) with light overlap for context.
  chunkMaxChars: Number(opt("CHUNK_MAX_CHARS", "1600")),
  chunkOverlapChars: Number(opt("CHUNK_OVERLAP_CHARS", "200")),
  // Cap rows per CSV upload — bounds LLM/embedding spend and job duration for a
  // single ingestion (each row = classification + embedding calls).
  ingestionMaxRows: Number(opt("INGESTION_MAX_ROWS", "5000")),
  // Retention window (days) for the raw audit/metrics tables (query_logs,
  // token_usage). The nightly worker prunes rows older than this so global
  // COUNT/SUM on the admin dashboard stay bounded as history grows.
  metricsRetentionDays: Number(opt("METRICS_RETENTION_DAYS", "90")),

  // ── Grounded Q&A ────────────────────────────────────
  // NOTE: output-token caps (answer/summary/categorization) are hard constants in
  // their services (FR-18) — deliberately NOT env-tunable so cost ceilings hold.
  chatModel: opt("CHAT_MODEL", "gpt-5.4-nano"),
  retrievalTopN: Number(opt("RETRIEVAL_TOP_N", "5")),
  // Minimum cosine similarity for a chunk to count as "relevant". 0 disables the
  // filter (kNN always returns something). Raise it (~0.3 with real embeddings)
  // so off-topic questions hit the "no relevant reports" path (FR-24).
  retrievalMinSimilarity: Number(opt("RETRIEVAL_MIN_SIMILARITY", "0")),
  // How many prior turns (user+assistant exchanges) feed follow-up rewriting (FR-28).
  followupTurns: Number(opt("FOLLOWUP_TURNS", "3")),

  // ── Daily query quotas (FR-11/12) ───────────────────
  // Counted across search + ask combined, per UTC day. Admin is unlimited.
  quotaTrainee: Number(opt("QUOTA_TRAINEE_DAILY", "30")),
  quotaAnalyst: Number(opt("QUOTA_ANALYST_DAILY", "100")),
  quotaGuest: Number(opt("QUOTA_GUEST_DAILY", "2")),

  // ── Google OAuth (FR-3) ─────────────────────────────
  // Optional at boot: the strategy only registers when both are set. Callback URL
  // must match a redirect URI registered in Google Cloud Console.
  googleClientId: opt("GOOGLE_CLIENT_ID", ""),
  googleClientSecret: opt("GOOGLE_CLIENT_SECRET", ""),
  googleCallbackUrl: opt(
    "GOOGLE_CALLBACK_URL",
    `http://localhost:${port}/api/auth/google/callback`,
  ),
  // Where to send the browser after OAuth resolves.
  oauthSuccessRedirect: opt("OAUTH_SUCCESS_REDIRECT", "http://localhost:3000/auth/callback"),
  oauthFailureRedirect: opt("OAUTH_FAILURE_REDIRECT", "http://localhost:3000/login?error=oauth"),

  // Explicit allowlist of frontend origins (client + admin). Never wildcard
  // (PRD §8.1). Defaults cover local Next.js dev ports.
  corsOrigins: opt("CORS_ORIGINS", "http://localhost:3000,http://localhost:3001")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
} as const;

// ─── Boot-time validation (fail fast & loud) ──────────
// Beyond the always-required vars checked by need() above, enforce secret
// strength everywhere and a production-required tier so a misconfigured prod
// deploy dies at boot instead of silently degrading (dev-stub AI, unset email
// key → codes in logs, localhost CORS, etc.).
function failBoot(message: string): never {
  // eslint-disable-next-line no-console -- boot failure, logger isn't up yet
  console.error(`✖ ${message}`);
  process.exit(1);
}

// A short/guessable HS256 secret is crackable offline from a single captured
// token — require real entropy regardless of environment.
if (env.jwtAccessSecret.length < 32) {
  failBoot("JWT_ACCESS_SECRET must be at least 32 characters (use a random 256-bit value).");
}

if (env.isProduction) {
  // Checked against the RAW env (not env.* which carries localhost defaults for
  // CORS/PUBLIC_BASE_URL), so the dev defaults can't satisfy a prod boot.
  const PROD_REQUIRED = [
    "OPENAI_API_KEY",
    "BREVO_SMTP_USER",
    "BREVO_SMTP_KEY",
    "CORS_ORIGINS",
    "PUBLIC_BASE_URL",
  ];
  const missing = PROD_REQUIRED.filter((name) => !process.env[name]?.trim());
  if (missing.length > 0) {
    failBoot(`Missing required production environment variables: ${missing.join(", ")}`);
  }
}

// True only when Google OAuth is fully configured.
export const isGoogleOAuthEnabled = Boolean(env.googleClientId && env.googleClientSecret);
