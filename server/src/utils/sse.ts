import type { Response } from "express";

// Named events so the browser can addEventListener("token" | "sources" | "done" |
// "error"). NOTE: compression is disabled for text/event-stream in app.ts,
// otherwise the stream is buffered and tokens don't arrive live.

export function initSse(res: Response): void {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    // Stops nginx and Render from buffering the response.
    "X-Accel-Buffering": "no",
  });
}

export function sendEvent(res: Response, event: string, data: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}
