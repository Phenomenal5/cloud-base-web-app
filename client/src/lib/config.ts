// ─── Client config ────────────────────────────────────
// NEXT_PUBLIC_* vars are inlined into the client bundle at build time.

export const config = {
  // Base URL of the Nasight API (Express backend, /api prefix).
  apiUrl: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api",
} as const;
