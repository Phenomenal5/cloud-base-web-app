import "dotenv/config";

// every bit of config is read and checked here, at boot. a missing or weak value
// should kill the process now, not turn up as a 500 on whichever request happens
// to need it first

type NodeEnv = "development" | "production" | "test";

// required. no value means we don't start
function need(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    // eslint-disable-next-line no-console -- the logger isn't up yet
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value;
}

// optional, falls back to a default
function opt(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.trim() ? value : fallback;
}

// numeric, and typos here are nasty. a bad value quietly becomes NaN and then
// breaks a quota or a TTL somewhere far away, so reject it right here
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

  // normal postgresql:// url. the CLI picks it up through prisma.config.ts, the
  // runtime through the driver adapter in config/prisma.ts
  databaseUrl: need("DATABASE_URL"),

  // pg-boss wants session-level features that transaction poolers (pgbouncer,
  // neon's -pooler host) don't do, so point this at a direct connection
  queueDatabaseUrl: opt("QUEUE_DATABASE_URL", need("DATABASE_URL")),

  // where this server is reachable from outside, no /api on the end. only used
  // to build absolute avatar urls
  publicBaseUrl: opt("PUBLIC_BASE_URL", `http://localhost:${port}`),

  // ========== auth ==================
  jwtAccessSecret: need("JWT_ACCESS_SECRET"),
  // plain seconds and days, so they can go straight into cookie maxAge
  jwtAccessTtlSeconds: num("JWT_ACCESS_TTL_SECONDS", 900),
  refreshTtlDays: num("REFRESH_TTL_DAYS", 30),

  // ========= email, brevo ===============
  // optional in dev. with no key emailService just logs the codes, so you can
  // still walk through verification locally
  brevoApiKey: opt("BREVO_API_KEY", ""),
  emailFrom: opt("EMAIL_FROM", "no-reply@nasight.app"),
  emailFromName: opt("EMAIL_FROM_NAME", "Nasight"),
  verificationCodeTtlMinutes: num("VERIFICATION_CODE_TTL_MINUTES", 15),
  passwordResetTtlMinutes: num("PASSWORD_RESET_TTL_MINUTES", 15),

  // ========== ai and embeddings ============
  // also optional in dev. no key and the services use stubs, so the pipeline
  // runs end to end, it just isn't really semantic
  openaiApiKey: opt("OPENAI_API_KEY", ""),
  embeddingModel: opt("EMBEDDING_MODEL", "text-embedding-3-small"),
  // about 400 tokens a chunk at ~4 chars per token, plus overlap so meaning
  // doesn't fall down the gap between two chunks
  chunkMaxChars: num("CHUNK_MAX_CHARS", 1600),
  chunkOverlapChars: num("CHUNK_OVERLAP_CHARS", 200),
  // every row is a classification call plus an embedding call, so this caps what
  // one upload can cost and how long it can run
  ingestionMaxRows: num("INGESTION_MAX_ROWS", 5000),
  // how long the raw query_logs and token_usage rows stick around. the nightly
  // worker folds finished days into daily_metrics before deleting them
  metricsRetentionDays: num("METRICS_RETENTION_DAYS", 90),

  // ========= grounded Q&A ===============
  // note the output token caps are NOT here, they're constants in the services.
  // config shouldn't be able to raise the per-answer cost ceiling
  chatModel: opt("CHAT_MODEL", "gpt-4o-mini"),
  retrievalTopN: num("RETRIEVAL_TOP_N", 5),
  // how similar a chunk has to be to count. kNN always returns something, so 0
  // means no filtering. with real embeddings push it to about 0.3 so off-topic
  // questions actually hit the "no relevant reports" answer
  retrievalMinSimilarity: num("RETRIEVAL_MIN_SIMILARITY", 0),
  // how many earlier turns go into the follow-up rewrite
  followupTurns: num("FOLLOWUP_TURNS", 3),

  // ========== daily quotas ============
  // counted per UTC day. admins aren't capped at all
  quotaTrainee: num("QUOTA_TRAINEE_DAILY", 30),
  quotaAnalyst: num("QUOTA_ANALYST_DAILY", 100),
  quotaGuest: num("QUOTA_GUEST_DAILY", 2),

  // ========= google oauth ===============
  // the strategy only registers if both of these are set. the callback url has
  // to match a redirect URI registered in google cloud console exactly
  googleClientId: opt("GOOGLE_CLIENT_ID", ""),
  googleClientSecret: opt("GOOGLE_CLIENT_SECRET", ""),
  googleCallbackUrl: opt(
    "GOOGLE_CALLBACK_URL",
    `http://localhost:${port}/api/auth/google/callback`,
  ),
  // has to match the client's route. the page is app/(auth)/oauth-callback, so
  // it's /oauth-callback, not /auth/callback
  oauthSuccessRedirect: opt("OAUTH_SUCCESS_REDIRECT", "http://localhost:3000/oauth-callback"),
  oauthFailureRedirect: opt("OAUTH_FAILURE_REDIRECT", "http://localhost:3000/login?error=oauth"),

  // spelled-out list of frontend origins, client and admin. never a wildcard
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

// a short HS256 secret can be brute-forced offline from one captured token, so
// this is enforced everywhere, not just in production
if (env.jwtAccessSecret.length < 32) {
  failBoot("JWT_ACCESS_SECRET must be at least 32 characters (use a random 256-bit value).");
}

if (env.isProduction) {
  // check process.env directly, not env.*. env.* has localhost defaults baked in
  // that would happily satisfy a production boot
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
