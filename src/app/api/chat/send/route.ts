import { NextResponse } from "next/server";
import { chat, isRoom } from "@/lib/server/chat";
import { resolveAuthor } from "@/lib/server/identity";
import { clientIp, jsonError, readJson, sameOrigin } from "@/lib/server/http";
import { limiter } from "@/lib/server/ratelimit";

export const dynamic = "force-dynamic";

/** POST /api/chat/send { room, text, replyTo? } */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return jsonError("Bad origin", 403);
  const author = resolveAuthor(req);
  if (!author) return jsonError("Sign in to chat", 401);

  // per-identity and per-IP buckets: wallets burst 5 then 1 per 1.5s, guests burst 3 then 1 per 4s
  if (!author.admin) {
    const wait = author.kind === "guest"
      ? limiter("chat-guest", 3, 0.25).take(author.id)
      : limiter("chat-wallet", 5, 0.66).take(author.id);
    const ipWait = limiter("chat-ip", 12, 1).take(clientIp(req));
    const retryMs = Math.max(wait, ipWait);
    if (retryMs) return jsonError(`Slow down: wait ${Math.ceil(retryMs / 1000)}s`, 429, { retryMs });
  }

  const body = await readJson<{ room?: string; text?: string; replyTo?: string }>(req, 4096);
  if (!body || !isRoom(body.room)) return jsonError("Unknown room", 400);
  const r = chat.post(author, body.room, body.text, body.replyTo);
  if (!r.ok) return jsonError(r.error, r.status, r.retryMs ? { retryMs: r.retryMs } : undefined);
  return NextResponse.json({ ok: true, id: r.m.id }, { headers: { "Cache-Control": "no-store" } });
}
