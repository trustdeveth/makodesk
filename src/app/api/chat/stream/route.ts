import { chat } from "@/lib/server/chat";
import { sseResponse } from "@/lib/server/sse";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/chat/stream  (Server-Sent Events)
 *   event: init      { rooms, messages, online }
 *   event: msg       ChatMessage
 *   event: del       { room, ids }
 *   event: room      ChatRoomInfo
 *   event: presence  { online }
 */
export function GET(req: Request) {
  return sseResponse(req, "chat", send => {
    send(`retry: 3000\nevent: init\ndata: ${JSON.stringify(chat.snapshot())}\n\n`);
    return chat.subscribe(e => {
      const data = e.type === "msg" ? e.m : e.type === "room" ? e.room : e.type === "del" ? { room: e.room, ids: e.ids } : { online: e.online };
      send(`event: ${e.type}\ndata: ${JSON.stringify(data)}\n\n`);
    });
  });
}
