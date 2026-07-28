// RTK Query rejects with the axios baseQuery shape { status, data }, and our API
// errors are { status, message }. This digs the message out of that, or falls
// back to something the user can read.
export function getApiErrorMessage(
  error: unknown,
  fallback = 'Something went wrong. Please try again.',
): string {
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
