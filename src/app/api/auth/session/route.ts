import { NextResponse } from "next/server";
import { sessionInfo } from "@/lib/server/identity";

export const dynamic = "force-dynamic";

/** GET /api/auth/session -> { address, guestName, admin, allowGuests } */
export function GET(req: Request) {
  return NextResponse.json(sessionInfo(req), { headers: { "Cache-Control": "no-store" } });
}
