// VITE_* gets inlined into the bundle at build time, so nothing secret

export const config = {
  apiUrl: import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api',
}
