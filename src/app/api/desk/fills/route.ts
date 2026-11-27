import { NextResponse } from "next/server";
import { getDeskState } from "@/lib/server/source";

export const dynamic = "force-dynamic";

/** GET /api/desk/fills?limit=20 — latest desk fills. */
export function GET(req: Request) {
  const limit = Math.min(50, Math.max(1, Number(new URL(req.url).searchParams.get("limit")) || 20));
  const s = getDeskState();
  return NextResponse.json({ mode: s.mode, fills: s.fills.slice(0, limit) }, { headers: { "Cache-Control": "no-store" } });
}
