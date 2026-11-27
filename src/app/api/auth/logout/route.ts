import { NextResponse } from "next/server";
import { SESSION_COOKIE, cookieOpts } from "@/lib/server/session";
import { jsonError, sameOrigin } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/** POST /api/auth/logout -> clears the wallet session. */
export function POST(req: Request) {
  if (!sameOrigin(req)) return jsonError("Bad origin", 403);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", cookieOpts(0));
  return res;
}
