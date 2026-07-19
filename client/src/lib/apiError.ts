// ─── Extract a user-facing message from an API error ──
// RTK Query mutations reject with the axiosBaseQuery error shape: { status, data }.
// Our backend errors are { status, message } — pull the message out.

export function getApiErrorMessage(
  error: unknown,
  fallback = "Something went wrong. Please try again.",
): string {
  if (error && typeof error === "object") {
    const data = (error as { data?: unknown }).data;
    if (data && typeof data === "object" && "message" in data) {
      const message = (data as { message?: unknown }).message;
      if (typeof message === "string" && message) return message;
    }
    if (typeof data === "string" && data) return data;
  }
  return fallback;
}
