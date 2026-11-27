"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useWallet } from "@/components/app/WalletProvider";
import type { ChatMessage, ChatRoomId, ChatRoomInfo, ChatSession } from "@/lib/types";

/**
 * Chat client state. One SSE connection per tab, opened only while at least
 * one chat view is mounted (ref-counted via useChat()).
 */
type Status = "idle" | "connecting" | "live" | "reconnecting";

interface ChatApi {
  status: Status;
  rooms: ChatRoomInfo[];
  messages: Record<string, ChatMessage[]>;
  unread: Record<string, number>;
  online: number;
  session: ChatSession | null;
  hasMore: Record<string, boolean>;
  me: string | null; // author id
  markRead(room: ChatRoomId): void;
  setActive(room: ChatRoomId | null): void;
  send(room: ChatRoomId, text: string, replyTo?: string): Promise<void>;
  remove(room: ChatRoomId, id: string): Promise<void>;
  mute(authorId: string, minutes: number, purge: boolean): Promise<void>;
  pin(room: ChatRoomId, id: string | null): Promise<void>;
  slowMode(room: ChatRoomId, seconds: number): Promise<void>;
  signIn(): Promise<void>;
  signOut(): Promise<void>;
  setGuestName(name: string): Promise<void>;
  loadOlder(room: ChatRoomId): Promise<void>;
}

const Ctx = createContext<(ChatApi & { acquire(): () => void }) | null>(null);

async function api<T>(url: string, body?: unknown): Promise<T> {
  const r = await fetch(url, body === undefined ? { cache: "no-store" } : {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), cache: "no-store",
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { error?: string }).error || `Request failed (${r.status})`);
  return j as T;
}

const MAX_KEEP = 400;

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const wallet = useWallet();
  const [refs, setRefs] = useState(0);
  const [status, setStatus] = useState<Status>("idle");
  const [rooms, setRooms] = useState<ChatRoomInfo[]>([]);
  const [messages, setMessages] = useState<Record<string, ChatMessage[]>>({});
  const [unread, setUnread] = useState<Record<string, number>>({});
  const [online, setOnline] = useState(0);
  const [session, setSession] = useState<ChatSession | null>(null);
  const [hasMore, setHasMore] = useState<Record<string, boolean>>({});
  const active = useRef<ChatRoomId | null>(null);

  const acquire = useCallback(() => {
    setRefs(n => n + 1);
    return () => setRefs(n => n - 1);
  }, []);

  const refreshSession = useCallback(() => api<ChatSession>("/api/auth/session").then(setSession).catch(() => {}), []);

  useEffect(() => {
    if (refs <= 0) return;
    void refreshSession();
    let es: EventSource | null = null;
    let closed = false;
    setStatus("connecting");
    const open = () => {
      if (closed) return;
      es = new EventSource("/api/chat/stream");
      es.addEventListener("init", e => {
        const d = JSON.parse((e as MessageEvent).data) as { rooms: ChatRoomInfo[]; messages: Record<string, ChatMessage[]>; online: number };
        setRooms(d.rooms);
        setMessages(d.messages);
        setOnline(d.online);
        setHasMore(Object.fromEntries(Object.entries(d.messages).map(([k, v]) => [k, v.length >= 120])));
        setStatus("live");
      });
      es.addEventListener("msg", e => {
        const m = JSON.parse((e as MessageEvent).data) as ChatMessage;
        setMessages(prev => {
          const list = prev[m.room] ?? [];
          if (list.some(x => x.id === m.id)) return prev;
          const next = [...list, m];
          return { ...prev, [m.room]: next.length > MAX_KEEP ? next.slice(-MAX_KEEP) : next };
        });
        if (active.current !== m.room || document.hidden) setUnread(u => ({ ...u, [m.room]: (u[m.room] ?? 0) + 1 }));
      });
      es.addEventListener("del", e => {
        const d = JSON.parse((e as MessageEvent).data) as { room: string; ids: string[] };
        const ids = new Set(d.ids);
        setMessages(prev => ({ ...prev, [d.room]: (prev[d.room] ?? []).filter(m => !ids.has(m.id)) }));
      });
      es.addEventListener("room", e => {
        const r = JSON.parse((e as MessageEvent).data) as ChatRoomInfo;
        setRooms(prev => prev.map(x => (x.id === r.id ? r : x)));
      });
      es.addEventListener("presence", e => setOnline((JSON.parse((e as MessageEvent).data) as { online: number }).online));
      es.onerror = () => setStatus("reconnecting"); // EventSource retries on its own (retry: 3000)
    };
    open();
    return () => { closed = true; es?.close(); setStatus("idle"); };
  }, [refs, refreshSession]);

  // wallet account switched away from the signed-in address: drop the stale view of the session
  useEffect(() => {
    if (session?.address && wallet.address && wallet.address.toLowerCase() !== session.address.toLowerCase()) void refreshSession();
  }, [wallet.address, session?.address, refreshSession]);

  const markRead = useCallback((room: ChatRoomId) => setUnread(u => (u[room] ? { ...u, [room]: 0 } : u)), []);
  const setActive = useCallback((room: ChatRoomId | null) => { active.current = room; if (room) setUnread(u => (u[room] ? { ...u, [room]: 0 } : u)); }, []);

  const send = useCallback(async (room: ChatRoomId, text: string, replyTo?: string) => {
    await api("/api/chat/send", { room, text, replyTo });
  }, []);
  const remove = useCallback(async (room: ChatRoomId, id: string) => { await api("/api/chat/moderate", { action: "delete", room, id }); }, []);
  const mute = useCallback(async (authorId: string, minutes: number, purge: boolean) => { await api("/api/chat/moderate", { action: "mute", authorId, minutes, purge }); }, []);
  const pin = useCallback(async (room: ChatRoomId, id: string | null) => { await api("/api/chat/moderate", { action: "pin", room, id }); }, []);
  const slowMode = useCallback(async (room: ChatRoomId, seconds: number) => { await api("/api/chat/moderate", { action: "slowmode", room, seconds }); }, []);

  const signIn = useCallback(async () => {
    const { message } = await api<{ message: string }>("/api/auth/nonce");
    const { signature } = await wallet.signMessage(message);
    await api("/api/auth/verify", { message, signature });
    await refreshSession();
  }, [wallet, refreshSession]);
  const signOut = useCallback(async () => { await api("/api/auth/logout", {}); await refreshSession(); }, [refreshSession]);
  const setGuestName = useCallback(async (name: string) => { await api("/api/auth/guest", { name }); await refreshSession(); }, [refreshSession]);

  const loadOlder = useCallback(async (room: ChatRoomId) => {
    const first = messages[room]?.[0];
    if (!first) return;
    const { messages: older } = await api<{ messages: ChatMessage[] }>(`/api/chat/history?room=${room}&before=${first.t}&limit=60`);
    setHasMore(h => ({ ...h, [room]: older.length >= 60 }));
    if (!older.length) return;
    setMessages(prev => {
      const have = new Set((prev[room] ?? []).map(m => m.id));
      return { ...prev, [room]: [...older.filter(m => !have.has(m.id)), ...(prev[room] ?? [])] };
    });
  }, [messages]);

  const me = session?.authorId ?? null;

  const value = useMemo(() => ({
    status, rooms, messages, unread, online, session, hasMore, me, acquire,
    markRead, setActive, send, remove, mute, pin, slowMode, signIn, signOut, setGuestName, loadOlder,
  }), [status, rooms, messages, unread, online, session, hasMore, me, acquire, markRead, setActive, send, remove, mute, pin, slowMode, signIn, signOut, setGuestName, loadOlder]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Subscribe to chat (opens the shared stream while mounted). */
export function useChat(): ChatApi {
  const v = useContext(Ctx);
  if (!v) throw new Error("useChat must be used inside ChatProvider");
  const { acquire } = v;
  useEffect(() => acquire(), [acquire]);
  return v;
}
