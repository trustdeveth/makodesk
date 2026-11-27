import { NextResponse } from "next/server";
import { getDeskState } from "@/lib/server/source";

export const dynamic = "force-dynamic";

/** GET /api/burns — burn log and totals. */
export function GET() {
  const s = getDeskState();
  return NextResponse.json(
    {
      mode: s.mode,
      totalBurned: s.burned,
      supply: s.supply,
      pctBurned: +((s.burned / s.supply) * 100).toFixed(4),
      burns: s.burns,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
