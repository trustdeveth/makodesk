import { NextResponse } from "next/server";
import { chat, isRoom } from "@/lib/server/chat";
import { clientIp, jsonError } from "@/lib/server/http";
import { limiter } from "@/lib/server/ratelimit";

export const dynamic = "force-dynamic";

/** GET /api/chat/history?room=general&before=<ms>&limit=50 -> older messages. */
export function GET(req: Request) {
  if (limiter("chat-history", 20, 1).take(clientIp(req))) return jsonError("Rate limited", 429);
  const q = new URL(req.url).searchParams;
  const room = q.get("room");
  if (!isRoom(room)) return jsonError("Unknown room", 400);
  const before = Number(q.get("before")) || null;
  const limit = Math.min(100, Math.max(1, Number(q.get("limit")) || 50));
  return NextResponse.json({ room, messages: chat.history(room, before, limit) }, { headers: { "Cache-Control": "no-store" } });
}
