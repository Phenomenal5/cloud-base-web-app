// NEXT_PUBLIC_* gets inlined into the bundle at build time, so nothing secret

export const config = {
  apiUrl: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api",
} as const;
