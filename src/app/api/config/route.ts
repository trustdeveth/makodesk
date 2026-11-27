import { NextResponse } from "next/server";
import { getConfig } from "@/lib/config";

export const dynamic = "force-dynamic";

/** GET /api/config — public runtime config (no secrets live here). */
export function GET() {
  return NextResponse.json(getConfig(), { headers: { "Cache-Control": "public, max-age=30" } });
}
