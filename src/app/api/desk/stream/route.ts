import { subscribeDesk, getDeskState } from "@/lib/server/source";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Server-Sent Events stream of desk state.
 * GET /api/desk/stream  ->  "data: {DeskState}\n\n" every ~500 ms
 * Behind nginx: proxy_buffering off (see deploy/nginx.conf).
 */
export async function GET(req: Request) {
  const enc = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let ping: NodeJS.Timeout | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (chunk: string) => {
        try { controller.enqueue(enc.encode(chunk)); } catch { cleanup(); }
      };
      const cleanup = () => {
        unsubscribe?.(); unsubscribe = null;
        if (ping) { clearInterval(ping); ping = null; }
        try { controller.close(); } catch { /* already closed */ }
      };

      send(`retry: 3000\ndata: ${JSON.stringify(getDeskState())}\n\n`);
      unsubscribe = subscribeDesk(s => send(`data: ${JSON.stringify(s)}\n\n`));
      ping = setInterval(() => send(`: ping\n\n`), 15_000);
      req.signal.addEventListener("abort", cleanup);
    },
    cancel() {
      unsubscribe?.();
      if (ping) clearInterval(ping);
    },
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
