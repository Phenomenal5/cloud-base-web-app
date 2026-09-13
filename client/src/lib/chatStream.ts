import { config } from "./config";
import type { Source, Citation, UsageInfo } from "./types";

// opens the SSE connection to /ask and hands its named events to callbacks.
// returns a function that closes the stream, for cancelling a question.
//
// EventSource rather than axios, it's the browser's own SSE client.
// withCredentials sends the auth cookie, which is how a signed-in user gets a
// saved conversation out of it

export interface StreamMeta {
  conversationId?: string;
  rewrittenQuery?: string;
}

// `code` is how the UI knows whether this is something they can do something
// about (wait for the reset, sign in) or just broken
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
  // lands just before done/error with what the turn actually cost. small talk
  // costs nothing, which is why this number comes from the server and we never
  // just subtract one locally
  onUsage?: (usage: UsageInfo) => void;
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

  eventSource.addEventListener("usage", (event) => {
    callbacks.onUsage?.(JSON.parse((event as MessageEvent).data) as UsageInfo);
  });

  eventSource.addEventListener("done", (event) => {
    finished = true;
    callbacks.onDone?.(JSON.parse((event as MessageEvent).data) as StreamDone);
    eventSource.close();
  });

  // "error" fires for two completely different things. a server-sent
  // `event: error` arrives with .data on it. a transport error, including the
  // normal socket close after "done", arrives without. anything the server wants
  // to explain comes with .data, which is exactly why refusals are sent as events
  // instead of a 429 the browser would swallow
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
