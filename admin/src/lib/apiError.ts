// ─── Extract a user-facing message from an API error ──
// RTK Query mutations reject with the axios baseQuery shape { status, data };
// backend errors are { status, message }.

export function getApiErrorMessage(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (error && typeof error === 'object') {
    const data = (error as { data?: unknown }).data
    if (data && typeof data === 'object' && 'message' in data) {
      const message = (data as { message?: unknown }).message
      if (typeof message === 'string' && message) return message
    }
    if (typeof data === 'string' && data) return data
  }
  return fallback
}
