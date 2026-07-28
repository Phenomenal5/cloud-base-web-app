import "dotenv/config";

// All config is read and validated here at boot, so a missing or weak value kills
// the process instead of surfacing as a 500 on the first request that needs it.

type NodeEnv = "development" | "production" | "test";

function need(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    // eslint-disable-next-line no-console -- the logger isn't up yet
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value;
}

function opt(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.trim() ? value : fallback;
}

// Numeric vars are typo-prone; a bad one silently becomes NaN and breaks quotas
// or TTLs in ways that are hard to trace, so reject it at boot instead.
function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw || !raw.trim()) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    // eslint-disable-next-line no-console -- the logger isn't up yet
    console.error(`Environment variable ${name} must be a number (got "${raw}")`);
    process.exit(1);
  }
  return parsed;
}

const nodeEnv = opt("NODE_ENV", "development") as NodeEnv;
const port = num("PORT", 8000);

export const env = {
  nodeEnv,
  isProduction: nodeEnv === "production",
  isTest: nodeEnv === "test",
  port,

  // Standard postgresql:// URL. Read by the CLI via prisma.config.ts and by the
  // pg driver adapter at runtime (see config/prisma.ts).
  databaseUrl: need("DATABASE_URL"),

  // pg-boss needs session-level features that transaction poolers (PgBouncer,
  // Neon's -pooler host) don't support, so prefer a direct URL here.
  queueDatabaseUrl: opt("QUEUE_DATABASE_URL", need("DATABASE_URL")),

  // Externally reachable origin of this server, no /api. Used to build absolute
  // URLs for statically served avatars.
  publicBaseUrl: opt("PUBLIC_BASE_URL", `http://localhost:${port}`),

  // ─── Auth ───────────────────────────────────────────
  jwtAccessSecret: need("JWT_ACCESS_SECRET"),
  // Kept as plain seconds/days so they can feed cookie maxAge directly.
  jwtAccessTtlSeconds: num("JWT_ACCESS_TTL_SECONDS", 900),
  refreshTtlDays: num("REFRESH_TTL_DAYS", 30),

  // ─── Email (Brevo transactional API) ────────────────
  // Optional in dev: with no key, emailService logs codes so the flow is testable.
  brevoApiKey: opt("BREVO_API_KEY", ""),
  emailFrom: opt("EMAIL_FROM", "no-reply@nasight.app"),
  emailFromName: opt("EMAIL_FROM_NAME", "Nasight"),
  verificationCodeTtlMinutes: num("VERIFICATION_CODE_TTL_MINUTES", 15),
  passwordResetTtlMinutes: num("PASSWORD_RESET_TTL_MINUTES", 15),

  // ─── AI / embeddings ────────────────────────────────
  // Optional in dev: without a key the services fall back to deterministic stubs
  // so the pipeline still runs, but search isn't semantic.
  openaiApiKey: opt("OPENAI_API_KEY", ""),
  embeddingModel: opt("EMBEDDING_MODEL", "text-embedding-3-small"),
  // Roughly 400 tokens per chunk at ~4 chars/token, with a little overlap so
  // context isn't lost at the seams.
  chunkMaxChars: num("CHUNK_MAX_CHARS", 1600),
  chunkOverlapChars: num("CHUNK_OVERLAP_CHARS", 200),
  // Every row costs a classification + an embedding call, so cap the spend and
  // the job duration of a single upload.
  ingestionMaxRows: num("INGESTION_MAX_ROWS", 5000),
  // How long raw query_logs / token_usage rows are kept. The nightly worker rolls
  // completed days into daily_metrics before pruning, which keeps the admin
  // dashboard's totals cheap as history grows.
  metricsRetentionDays: num("METRICS_RETENTION_DAYS", 90),

  // ─── Grounded Q&A ───────────────────────────────────
  // Output-token caps live as constants in their services, deliberately not here,
  // so the per-answer cost ceiling can't be raised through configuration.
  chatModel: opt("CHAT_MODEL", "gpt-4o-mini"),
  retrievalTopN: num("RETRIEVAL_TOP_N", 5),
  // Minimum cosine similarity for a chunk to count as relevant. kNN always
  // returns something, so 0 disables the filter; with real embeddings raise it to
  // around 0.3 so off-topic questions hit the "no relevant reports" path.
  retrievalMinSimilarity: num("RETRIEVAL_MIN_SIMILARITY", 0),
  // Prior turns fed to the follow-up rewrite.
  followupTurns: num("FOLLOWUP_TURNS", 3),

  // ─── Daily query quotas ─────────────────────────────
  // Counted per UTC day across search and ask. Admin is unlimited.
  quotaTrainee: num("QUOTA_TRAINEE_DAILY", 30),
  quotaAnalyst: num("QUOTA_ANALYST_DAILY", 100),
  quotaGuest: num("QUOTA_GUEST_DAILY", 2),

  // ─── Google OAuth ───────────────────────────────────
  // The strategy only registers when both are set. The callback URL must match a
  // redirect URI registered in Google Cloud Console.
  googleClientId: opt("GOOGLE_CLIENT_ID", ""),
  googleClientSecret: opt("GOOGLE_CLIENT_SECRET", ""),
  googleCallbackUrl: opt(
    "GOOGLE_CALLBACK_URL",
    `http://localhost:${port}/api/auth/google/callback`,
  ),
  // NOTE: must match the client's route. The page is app/(auth)/oauth-callback,
  // so this is /oauth-callback, not /auth/callback.
  oauthSuccessRedirect: opt("OAUTH_SUCCESS_REDIRECT", "http://localhost:3000/oauth-callback"),
  oauthFailureRedirect: opt("OAUTH_FAILURE_REDIRECT", "http://localhost:3000/login?error=oauth"),

  // Explicit allowlist of frontend origins (client + admin). Never a wildcard.
  corsOrigins: opt("CORS_ORIGINS", "http://localhost:3000,http://localhost:3001")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
} as const;

function failBoot(message: string): never {
  // eslint-disable-next-line no-console -- the logger isn't up yet
  console.error(message);
  process.exit(1);
}

// A short HS256 secret can be cracked offline from a single captured token, so
// require real entropy in every environment, not just production.
if (env.jwtAccessSecret.length < 32) {
  failBoot("JWT_ACCESS_SECRET must be at least 32 characters (use a random 256-bit value).");
}

if (env.isProduction) {
  // Checked against the raw env rather than env.*, because env.* carries
  // localhost defaults that would otherwise satisfy a production boot.
  const productionRequired = ["OPENAI_API_KEY", "BREVO_API_KEY", "CORS_ORIGINS", "PUBLIC_BASE_URL"];
  const missing = productionRequired.filter((name) => !process.env[name]?.trim());
  if (missing.length > 0) {
    failBoot(`Missing required production environment variables: ${missing.join(", ")}`);
  }

  if (env.corsOrigins.some((origin) => origin === "*" || origin.startsWith("http://localhost"))) {
    failBoot("CORS_ORIGINS must be real https origins in production (no wildcard, no localhost).");
  }
}

export const isGoogleOAuthEnabled = Boolean(env.googleClientId && env.googleClientSecret);
