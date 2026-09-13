// RTK Query rejects with axiosBaseQuery's shape { status, data }, and our own
// errors are { status, message } inside that. this digs the message out, or
// gives back something readable if it can't
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
