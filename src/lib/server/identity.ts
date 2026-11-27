import "server-only";
import type { ChatAuthor, ChatSession } from "../types";
import { getGuest, getSession, isAdmin } from "./session";

export const guestsAllowed = () => (process.env.CHAT_ALLOW_GUESTS ?? "true").trim() !== "false";
const shortAddr = (a: string) => a.slice(0, 6) + "…" + a.slice(-4);

/** Who is making this request, as a chat author (wallet session wins over guest). */
export function resolveAuthor(req: Request): ChatAuthor | null {
  const s = getSession(req);
  if (s) return { id: s.addr.toLowerCase(), name: shortAddr(s.addr), kind: "wallet", ...(isAdmin(s.addr) ? { admin: true } : {}) };
  const gst = guestsAllowed() ? getGuest(req) : null;
  if (gst) return { id: "guest:" + gst.id, name: gst.name, kind: "guest" };
  return null;
}

export function sessionInfo(req: Request): ChatSession {
  const s = getSession(req);
  const gst = getGuest(req);
  const a = resolveAuthor(req);
  return { address: s?.addr ?? null, guestName: gst?.name ?? null, authorId: a?.id ?? null, name: a?.name ?? null, admin: isAdmin(s?.addr), allowGuests: guestsAllowed() };
}
