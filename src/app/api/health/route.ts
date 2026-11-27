import { NextResponse } from "next/server";
import { getDeskState } from "@/lib/server/source";
import { getConfig } from "@/lib/config";

export const dynamic = "force-dynamic";

/** GET /api/health — liveness for uptime monitors, Docker and PM2. */
export function GET() {
  const s = getDeskState();
  const cfg = getConfig();
  return NextResponse.json({
    ok: true,
    uptimeSec: Math.round(process.uptime()),
    mode: s.mode,
    engineAgeMs: Date.now() - s.t,
    chainId: cfg.chain.chainId,
    tokenConfigured: !!cfg.contracts.token,
    deskConfigured: !!cfg.contracts.desk,
  });
}
