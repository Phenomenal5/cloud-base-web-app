import type { Response } from "express";

// named events, so the browser can addEventListener("token" | "sources" |
// "done" | "error"). compression is switched off for text/event-stream over in
// app.ts, otherwise the stream buffers and the tokens stop arriving live

export function initSse(res: Response): void {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    // stops nginx and render buffering the response on us
    "X-Accel-Buffering": "no",
  });
}

export function sendEvent(res: Response, event: string, data: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}
