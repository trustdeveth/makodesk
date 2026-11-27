import { NextResponse } from "next/server";
import { getDeskState, sourceStatus } from "@/lib/server/source";
import { getConfig } from "@/lib/config";
import { chat } from "@/lib/server/chat";
import { totalConns } from "@/lib/server/ratelimit";

export const dynamic = "force-dynamic";

/** GET /api/health — liveness for uptime monitors, Docker and PM2. */
export function GET() {
  const s = getDeskState();
  const cfg = getConfig();
  const engineAgeMs = Date.now() - s.t;
  const ok = engineAgeMs < 10_000;
  return NextResponse.json({
    ok,
    uptimeSec: Math.round(process.uptime()),
    mode: s.mode,
    sources: s.sources,
    feeds: sourceStatus(),
    engineAgeMs,
    streams: totalConns(),
    chat: chat.stats(),
    chainId: cfg.chain.chainId,
    tokenConfigured: !!cfg.contracts.token,
    deskConfigured: !!cfg.contracts.desk,
  }, { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
