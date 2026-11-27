import { NextResponse } from "next/server";
import { cookieOpts, isAdmin, SESSION_COOKIE, SESSION_MAX_AGE, sessionToken, verifyLogin } from "@/lib/server/session";
import { clientIp, jsonError, readJson, sameOrigin } from "@/lib/server/http";
import { limiter } from "@/lib/server/ratelimit";

export const dynamic = "force-dynamic";

/** POST /api/auth/verify { message, signature } -> sets the session cookie. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return jsonError("Bad origin", 403);
  if (limiter("verify", 10, 0.2).take(clientIp(req))) return jsonError("Too many sign-in attempts, slow down", 429);
  const body = await readJson<{ message?: string; signature?: string }>(req);
  if (!body?.message || !body.signature) return jsonError("message and signature are required", 400);
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";
  try {
    const address = verifyLogin(body.message, body.signature, host);
    const res = NextResponse.json({ address, admin: isAdmin(address) }, { headers: { "Cache-Control": "no-store" } });
    res.cookies.set(SESSION_COOKIE, sessionToken(address), cookieOpts(SESSION_MAX_AGE));
    return res;
  } catch (e) {
    return jsonError("Sign-in failed: " + (e as Error).message, 401);
  }
}
