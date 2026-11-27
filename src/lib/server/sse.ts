import "server-only";
import { acquireConn } from "./ratelimit";
import { clientIp, jsonError } from "./http";

const MAX_PER_IP = Number(process.env.SSE_MAX_PER_IP) || 12;

/**
 * Server-Sent Events response with keep-alive pings, abort cleanup and a
 * per-IP concurrent-connection cap. `setup(send)` returns its own teardown.
 */
export function sseResponse(req: Request, name: string, setup: (send: (chunk: string) => void) => () => void): Response {
  const release = acquireConn(`${name}:${clientIp(req)}`, MAX_PER_IP);
  if (!release) return jsonError("Too many open streams from this address", 429);

  const enc = new TextEncoder();
  let teardown: (() => void) | null = null;
  let ping: NodeJS.Timeout | null = null;
  let done = false;

  const stop = () => {
    if (done) return;
    done = true;
    teardown?.(); teardown = null;
    if (ping) { clearInterval(ping); ping = null; }
    release();
  };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (chunk: string) => {
        if (done) return;
        try { controller.enqueue(enc.encode(chunk)); } catch { stop(); try { controller.close(); } catch { /* closed */ } }
      };
      teardown = setup(send);
      ping = setInterval(() => send(`: ping\n\n`), 15_000);
      req.signal.addEventListener("abort", () => { stop(); try { controller.close(); } catch { /* closed */ } });
    },
    cancel() { stop(); },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
