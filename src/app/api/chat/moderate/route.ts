import { NextResponse } from "next/server";
import { chat, isRoom } from "@/lib/server/chat";
import { resolveAuthor } from "@/lib/server/identity";
import { jsonError, readJson, sameOrigin } from "@/lib/server/http";

export const dynamic = "force-dynamic";

type Body =
  | { action: "delete"; room: string; id: string }
  | { action: "mute"; authorId: string; minutes: number; purge?: boolean }
  | { action: "pin"; room: string; id: string | null }
  | { action: "slowmode"; room: string; seconds: number };

/**
 * POST /api/chat/moderate
 * delete: authors may delete their own messages; admins any message.
 * mute / pin / slowmode: admins only (CHAT_ADMINS in .env).
 */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return jsonError("Bad origin", 403);
  const me = resolveAuthor(req);
  if (!me) return jsonError("Sign in first", 401);
  const b = await readJson<Body>(req);
  if (!b) return jsonError("Bad request", 400);

  if (b.action === "delete") {
    if (!isRoom(b.room) || typeof b.id !== "string") return jsonError("Bad request", 400);
    return chat.remove(b.room, b.id, me) ? NextResponse.json({ ok: true }) : jsonError("Not allowed", 403);
  }
  if (!me.admin) return jsonError("Admins only", 403);
  if (b.action === "mute") {
    if (typeof b.authorId !== "string" || !b.authorId || b.authorId === me.id || b.authorId === "system") return jsonError("Bad request", 400);
    chat.mute(b.authorId, Math.max(1, Math.min(60 * 24 * 365, Number(b.minutes) || 10)), !!b.purge);
    return NextResponse.json({ ok: true });
  }
  if (b.action === "pin") {
    if (!isRoom(b.room)) return jsonError("Bad request", 400);
    chat.pin(b.room, typeof b.id === "string" ? b.id : null);
    return NextResponse.json({ ok: true });
  }
  if (b.action === "slowmode") {
    if (!isRoom(b.room)) return jsonError("Bad request", 400);
    chat.setSlowMode(b.room, Number(b.seconds) || 0);
    return NextResponse.json({ ok: true });
  }
  return jsonError("Unknown action", 400);
}
