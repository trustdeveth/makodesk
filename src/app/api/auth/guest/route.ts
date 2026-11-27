import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { GUEST_COOKIE, GUEST_MAX_AGE, cookieOpts, getGuest, guestToken } from "@/lib/server/session";
import { guestsAllowed } from "@/lib/server/identity";
import { validGuestName } from "@/lib/server/chat";
import { clientIp, jsonError, readJson, sameOrigin } from "@/lib/server/http";
import { limiter } from "@/lib/server/ratelimit";

export const dynamic = "force-dynamic";

/** POST /api/auth/guest { name } -> sets a signed guest identity cookie. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return jsonError("Bad origin", 403);
  if (!guestsAllowed()) return jsonError("Guest chat is disabled. Sign in with a wallet.", 403);
  if (limiter("guest", 5, 0.05).take(clientIp(req))) return jsonError("Too many name changes, try later", 429);
  const body = await readJson<{ name?: string }>(req);
  const name = validGuestName(body?.name);
  if (!name) return jsonError("Use 3-20 letters, digits or _ (words like admin, mako, team are reserved)", 400);
  const id = getGuest(req)?.id ?? randomBytes(9).toString("base64url");
  const res = NextResponse.json({ guestName: name });
  res.cookies.set(GUEST_COOKIE, guestToken(id, name), cookieOpts(GUEST_MAX_AGE));
  return res;
}
