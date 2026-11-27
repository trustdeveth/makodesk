import { NextResponse } from "next/server";
import { getDeskState } from "@/lib/server/source";

export const dynamic = "force-dynamic";

/** GET /api/desk/state — full desk snapshot (same shape as the SSE stream). */
export function GET() {
  return NextResponse.json(getDeskState(), { headers: { "Cache-Control": "no-store" } });
}
