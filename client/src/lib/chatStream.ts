import { config } from "./config";
import type { Source, Citation } from "./types";

// Opens the SSE connection to /ask and hands its named events to callbacks.
// Returns a function that closes the stream, for cancelling a request.
//
// EventSource rather than axios, because it's the browser's native SSE consumer.
// withCredentials sends the auth cookie, so signed-in users get a persisted
// conversation and guests stream without one.

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

// `code` is what tells the UI whether this is something the user can act on
// (wait for the reset, sign in) or an actual failure.
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

  // NOTE: "error" fires for two different things. A server-sent `event: error`
  // arrives with .data; a transport error, including the normal socket close
  // after "done", arrives without it. Anything the server wants to explain
  // (quota exhausted, upstream down) comes with .data, which is exactly why the
  // server sends refusals as events instead of as a 429 the browser would hide.
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
