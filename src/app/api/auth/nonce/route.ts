import { NextResponse } from "next/server";
import { issueNonce, loginMessage } from "@/lib/server/session";
import { clientIp, jsonError } from "@/lib/server/http";
import { limiter } from "@/lib/server/ratelimit";

export const dynamic = "force-dynamic";

/** GET /api/auth/nonce -> { message } to be signed with personal_sign. */
export function GET(req: Request) {
  if (limiter("nonce", 10, 0.2).take(clientIp(req))) return jsonError("Too many sign-in attempts, slow down", 429);
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "makodesk.xyz";
  return NextResponse.json({ message: loginMessage(host, issueNonce()) }, { headers: { "Cache-Control": "no-store" } });
}
