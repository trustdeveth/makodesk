import "server-only";
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { CHAT_MAX_LEN, CHAT_ROOMS } from "../markets";
import type { ChatAuthor, ChatMessage, ChatRoomId, ChatRoomInfo } from "../types";

/**
 * Chat hub: one per process (same single-instance model as the market engine).
 * Messages fan out to every SSE subscriber; history is kept in memory and
 * flushed to DATA_DIR/chat.json so a restart doesn't wipe the rooms.
 */

export type ChatEvent =
  | { type: "msg"; m: ChatMessage }
  | { type: "del"; room: ChatRoomId; ids: string[] }
  | { type: "room"; room: ChatRoomInfo }
  | { type: "presence"; online: number };

const HISTORY = 300;           // per room, in memory
const INIT_SEND = 120;         // per room, sent on connect
const MAX_LINES = 12;

const URL_RE = /\b(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(?:com|xyz|io|net|org|app|gg|me|co|link|site|info|top|click)\b/i;
const PRIVKEY_RE = /\b(?:0x)?[0-9a-fA-F]{64}\b/;
const RESERVED_RE = /admin|mod(?:erator)?|mako|team|support|official|dev|founder|staff/i;

export const roomIds = CHAT_ROOMS.map(r => r.id) as ChatRoomId[];
export const isRoom = (r: unknown): r is ChatRoomId => typeof r === "string" && (roomIds as string[]).includes(r);

interface RoomState { info: ChatRoomInfo; messages: ChatMessage[] }
interface Persisted { v: 1; rooms: Record<string, { messages: ChatMessage[]; slowModeSec: number; pinnedId: string | null }>; mutes: Record<string, number> }

export function sanitizeText(raw: unknown): string {
  if (typeof raw !== "string") return "";
  let t = raw.replace(/\r\n?/g, "\n")
    // strip control chars (keep \n) and bidi overrides used for spoofing
    .replace(/[\u0000-\u0009\u000B-\u001F\u007F‪-‮⁦-⁩​-‏]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const lines = t.split("\n");
  if (lines.length > MAX_LINES) t = lines.slice(0, MAX_LINES).join("\n");
  return t.slice(0, CHAT_MAX_LEN);
}

export function validGuestName(n: unknown): string | null {
  if (typeof n !== "string") return null;
  const s = n.trim();
  if (!/^[A-Za-z0-9_]{3,20}$/.test(s) || RESERVED_RE.test(s)) return null;
  return s;
}

class ChatHub {
  rooms = new Map<ChatRoomId, RoomState>();
  listeners = new Set<(e: ChatEvent) => void>();
  mutes = new Map<string, number>();       // author id -> until (ms)
  lastPost = new Map<string, { text: string; t: number; room: string }>();
  private saveTimer: NodeJS.Timeout | null = null;
  private presenceTimer: NodeJS.Timeout | null = null;
  private file: string;

  constructor() {
    this.file = path.join(path.resolve(process.env.DATA_DIR?.trim() || "data"), "chat.json");
    for (const r of CHAT_ROOMS) {
      this.rooms.set(r.id, { info: { id: r.id, name: r.name, topic: r.topic, slowModeSec: 0, pinned: null }, messages: [] });
    }
    this.load();
    for (const r of CHAT_ROOMS) {
      const st = this.rooms.get(r.id)!;
      if (!st.messages.length && r.id === "general") {
        st.messages.push(this.system(r.id, "Welcome to Mako Desk chat. Be kind, no shilling, and remember: the team will never DM you first or ask for your seed phrase."));
      }
    }
  }

  private system(room: ChatRoomId, text: string): ChatMessage {
    return { id: newId(), room, t: Date.now(), author: { id: "system", name: "Mako Desk", kind: "wallet", admin: true }, text };
  }

  /* ---------- persistence ---------- */
  private load() {
    try {
      const data = JSON.parse(readFileSync(this.file, "utf8")) as Persisted;
      if (data.v !== 1) return;
      for (const [id, r] of Object.entries(data.rooms ?? {})) {
        if (!isRoom(id)) continue;
        const st = this.rooms.get(id)!;
        st.messages = (r.messages ?? []).filter(m => m && typeof m.text === "string").slice(-HISTORY);
        st.info.slowModeSec = Math.max(0, Math.min(300, r.slowModeSec | 0));
        st.info.pinned = st.messages.find(m => m.id === r.pinnedId) ?? null;
      }
      const now = Date.now();
      for (const [k, until] of Object.entries(data.mutes ?? {})) if (until > now) this.mutes.set(k, until);
    } catch { /* first run or unreadable file: start empty */ }
  }

  private scheduleSave() {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.saveNow();
    }, 2000);
    this.saveTimer.unref?.();
  }

  saveNow() {
    const data: Persisted = { v: 1, rooms: {}, mutes: Object.fromEntries(this.mutes) };
    for (const [id, st] of this.rooms) {
      data.rooms[id] = { messages: st.messages.slice(-HISTORY), slowModeSec: st.info.slowModeSec, pinnedId: st.info.pinned?.id ?? null };
    }
    try {
      mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = this.file + ".tmp";
      writeFileSync(tmp, JSON.stringify(data));
      renameSync(tmp, this.file);
    } catch (e) {
      console.error("[mako] chat persist failed:", (e as Error).message);
    }
  }

  /* ---------- fan-out ---------- */
  private emit(e: ChatEvent) {
    this.listeners.forEach(fn => { try { fn(e); } catch { /* dead listener */ } });
  }

  subscribe(fn: (e: ChatEvent) => void) {
    this.listeners.add(fn);
    this.schedulePresence();
    return () => { this.listeners.delete(fn); this.schedulePresence(); };
  }

  private schedulePresence() {
    if (this.presenceTimer) return;
    this.presenceTimer = setTimeout(() => {
      this.presenceTimer = null;
      this.emit({ type: "presence", online: this.listeners.size });
    }, 1500);
    this.presenceTimer.unref?.();
  }

  snapshot() {
    return {
      rooms: roomIds.map(id => this.rooms.get(id)!.info),
      messages: Object.fromEntries(roomIds.map(id => [id, this.rooms.get(id)!.messages.slice(-INIT_SEND)])) as Record<ChatRoomId, ChatMessage[]>,
      online: this.listeners.size,
    };
  }

  history(room: ChatRoomId, before: number | null, limit: number) {
    const msgs = this.rooms.get(room)!.messages;
    const end = before ? msgs.findIndex(m => m.t >= before) : msgs.length;
    const stop = end < 0 ? msgs.length : end;
    return msgs.slice(Math.max(0, stop - limit), stop);
  }

  /* ---------- posting ---------- */
  post(author: ChatAuthor, room: ChatRoomId, rawText: unknown, replyToId: unknown): { ok: true; m: ChatMessage } | { ok: false; error: string; retryMs?: number; status: number } {
    const now = Date.now();
    const until = this.mutes.get(author.id);
    if (until && until > now && !author.admin) return { ok: false, error: `You are muted for ${Math.ceil((until - now) / 60_000)} more min`, status: 403 };

    const text = sanitizeText(rawText);
    if (!text) return { ok: false, error: "Message is empty", status: 400 };
    if (!author.admin) {
      if (PRIVKEY_RE.test(text)) return { ok: false, error: "That looks like a private key. Never share it with anyone.", status: 400 };
      if (author.kind === "guest" && URL_RE.test(text)) return { ok: false, error: "Sign in with a wallet to post links", status: 403 };
    }

    const st = this.rooms.get(room)!;
    const last = this.lastPost.get(author.id);
    if (!author.admin) {
      if (st.info.slowModeSec && last && last.room === room && now - last.t < st.info.slowModeSec * 1000) {
        const retryMs = st.info.slowModeSec * 1000 - (now - last.t);
        return { ok: false, error: `Slow mode: wait ${Math.ceil(retryMs / 1000)}s`, retryMs, status: 429 };
      }
      if (last && last.text === text && now - last.t < 60_000) return { ok: false, error: "Duplicate message", status: 429 };
    }

    let replyTo: ChatMessage["replyTo"];
    if (typeof replyToId === "string" && replyToId) {
      const parent = st.messages.find(m => m.id === replyToId);
      if (parent) replyTo = { id: parent.id, name: parent.author.name, text: parent.text.slice(0, 140) };
    }

    const m: ChatMessage = { id: newId(), room, t: now, author, text, ...(replyTo ? { replyTo } : {}) };
    st.messages.push(m);
    if (st.messages.length > HISTORY) st.messages.splice(0, st.messages.length - HISTORY);
    this.lastPost.set(author.id, { text, t: now, room });
    if (this.lastPost.size > 20_000) this.lastPost.clear();
    this.emit({ type: "msg", m });
    this.scheduleSave();
    return { ok: true, m };
  }

  /* ---------- moderation ---------- */
  remove(room: ChatRoomId, id: string, by: ChatAuthor): boolean {
    const st = this.rooms.get(room)!;
    const i = st.messages.findIndex(m => m.id === id);
    if (i < 0) return false;
    const m = st.messages[i];
    if (!by.admin && m.author.id !== by.id) return false;
    st.messages.splice(i, 1);
    this.emit({ type: "del", room, ids: [id] });
    if (st.info.pinned?.id === id) { st.info.pinned = null; this.emit({ type: "room", room: st.info }); }
    this.scheduleSave();
    return true;
  }

  /** Mute an author and remove their recent messages (purge) everywhere. */
  mute(authorId: string, minutes: number, purge: boolean) {
    this.mutes.set(authorId, Date.now() + minutes * 60_000);
    if (purge) {
      for (const [room, st] of this.rooms) {
        const ids = st.messages.filter(m => m.author.id === authorId).map(m => m.id);
        if (!ids.length) continue;
        st.messages = st.messages.filter(m => m.author.id !== authorId);
        this.emit({ type: "del", room, ids });
      }
    }
    this.scheduleSave();
  }

  pin(room: ChatRoomId, id: string | null) {
    const st = this.rooms.get(room)!;
    st.info.pinned = id ? st.messages.find(m => m.id === id) ?? null : null;
    this.emit({ type: "room", room: st.info });
    this.scheduleSave();
  }

  setSlowMode(room: ChatRoomId, sec: number) {
    const st = this.rooms.get(room)!;
    st.info.slowModeSec = Math.max(0, Math.min(300, Math.round(sec)));
    this.emit({ type: "room", room: st.info });
    this.scheduleSave();
  }

  stats() {
    let messages = 0;
    for (const st of this.rooms.values()) messages += st.messages.length;
    return { subscribers: this.listeners.size, messages, mutes: this.mutes.size };
  }
}

const newId = () => Date.now().toString(36) + randomBytes(5).toString("hex");

const g = globalThis as unknown as { __makoChat?: ChatHub; __makoChatHooked?: boolean };
export const chat: ChatHub = g.__makoChat ?? (g.__makoChat = new ChatHub());

// flush on shutdown so the last couple of seconds of chat aren't lost
if (!g.__makoChatHooked) {
  g.__makoChatHooked = true;
  for (const sig of ["SIGINT", "SIGTERM"] as const) {
    process.once(sig, () => {
      try { g.__makoChat?.saveNow(); } catch { /* best effort */ }
      // only exit ourselves if nothing else (e.g. Next's graceful shutdown) handles the signal
      if (process.listenerCount(sig) === 0) process.exit(0);
    });
  }
}
