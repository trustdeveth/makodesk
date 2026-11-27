import { subscribeDesk, getDeskState } from "@/lib/server/source";
import { sseResponse } from "@/lib/server/sse";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Server-Sent Events stream of desk state.
 * GET /api/desk/stream  ->  "data: {DeskState}\n\n" every ~500 ms
 * Behind nginx: proxy_buffering off (see deploy/nginx.conf).
 */
export function GET(req: Request) {
  return sseResponse(req, "desk", send => {
    send(`retry: 3000\ndata: ${JSON.stringify(getDeskState())}\n\n`);
    return subscribeDesk(s => send(`data: ${JSON.stringify(s)}\n\n`));
  });
}
