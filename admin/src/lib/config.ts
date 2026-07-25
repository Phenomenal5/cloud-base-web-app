// ─── Admin client config ──────────────────────────────
// VITE_* vars are inlined into the bundle at build time.

export const config = {
  // Base URL of the Nasight API (Express backend, /api prefix).
  apiUrl: import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api',
}
