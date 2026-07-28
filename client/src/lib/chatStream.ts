import { config } from "./config";
import type { Source, Citation } from "./types";

// ─── Grounded Q&A streaming (SSE / EventSource) ───────
//
// Opens an SSE connection to /ask and dispatches its named events to callbacks.
// Returns a function that closes the stream (call it to cancel a request).
//
// EventSource is used (not axios) because it's the browser-native SSE consumer.
// withCredentials sends the httpOnly auth cookie so signed-in users get a
// persisted conversation; guests stream statelessly.

export interface QuotaState {
  limit: number | null;
  remaining: number | null;
  resetsAt: string | null;
}

export interface StreamMeta {
  conversationId?: string;
  rewrittenQuery?: string;
  quota?: QuotaState | null;
}

// A server-sent `error` event. `code` tells the UI whether this is something the
// user can act on (wait for the reset, sign in) or a genuine failure.
export interface StreamError {
  code?: "QUOTA_EXCEEDED";
  message: string;
  limit?: number;
  used?: number;
  resetsAt?: string;
  isGuest?: boolean;
}

export interface StreamDone {
  grounded: boolean;
  conversationId?: string;
  citations: Citation[];
}

interface StreamCallbacks {
  onMeta?: (meta: StreamMeta) => void;
  onSources?: (sources: Source[]) => void;
  onToken?: (text: string) => void;
  onDone?: (done: StreamDone) => void;
  onError?: (error: StreamError) => void;
}

export function streamAnswer(
  query: string,
  conversationId: string | undefined,
  callbacks: StreamCallbacks,
): () => void {
  const url = new URL(`${config.apiUrl}/ask`);
  url.searchParams.set("query", query);
  if (conversationId) url.searchParams.set("conversationId", conversationId);

  const eventSource = new EventSource(url.toString(), { withCredentials: true });
  let finished = false;

  eventSource.addEventListener("meta", (event) => {
    callbacks.onMeta?.(JSON.parse((event as MessageEvent).data) as StreamMeta);
  });

  eventSource.addEventListener("sources", (event) => {
    const payload = JSON.parse((event as MessageEvent).data) as { sources: Source[] };
    callbacks.onSources?.(payload.sources);
  });

  eventSource.addEventListener("token", (event) => {
    const payload = JSON.parse((event as MessageEvent).data) as { text: string };
    callbacks.onToken?.(payload.text);
  });

  eventSource.addEventListener("done", (event) => {
    finished = true;
    callbacks.onDone?.(JSON.parse((event as MessageEvent).data) as StreamDone);
    eventSource.close();
  });

  // NOTE: "error" fires for BOTH a server-sent `event: error` (has .data) and a
  // transport error (no .data) — including the normal socket close after "done".
  //
  // Anything the server wants to explain (quota exhausted, upstream AI down)
  // arrives with .data. A bodyless error genuinely is a lost connection — the
  // browser gives us no status code or body to say otherwise, which is exactly
  // why the server sends refusals as events rather than as a 429.
  eventSource.addEventListener("error", (event) => {
    const messageEvent = event as MessageEvent;
    if (messageEvent.data) {
      const payload = JSON.parse(messageEvent.data) as StreamError;
      callbacks.onError?.({ ...payload, message: payload.message || "Something went wrong." });
      eventSource.close();
    } else if (!finished) {
      callbacks.onError?.({ message: "Connection lost. Please try again." });
      eventSource.close();
    }
  });

  return () => eventSource.close();
}
