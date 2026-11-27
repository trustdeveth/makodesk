"use client";
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, BadgeCheck, Copy, Hash, LogOut, MessageSquareReply, Pin, PinOff, Send, ShieldCheck, Timer, Trash2, Users, VolumeX, Wallet, X } from "lucide-react";
import { useChat } from "./ChatProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { CHAT_MAX_LEN } from "@/lib/markets";
import type { ChatMessage, ChatRoomId } from "@/lib/types";

const GROUP_MS = 5 * 60_000;
const errText = (e: unknown) => ((e as Error)?.message || "Something went wrong").slice(0, 120);

function hue(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % 360;
}

function Avatar({ m }: { m: ChatMessage }) {
  if (m.author.id === "system") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="ch-av" src="/logo.svg" alt="" />;
  }
  const h = hue(m.author.id);
  const label = m.author.kind === "wallet" ? m.author.name.slice(2, 4) : m.author.name.slice(0, 2);
  return <span className="ch-av" style={{ background: `linear-gradient(135deg, hsl(${h} 60% 32%), hsl(${(h + 40) % 360} 70% 52%))` }}>{label.toUpperCase()}</span>;
}

const TOKEN_RE = /(https?:\/\/[^\s<]+[^\s<.,:;"')\]!?])|(@[A-Za-z0-9_…x]{3,20})|(\$[A-Z]{2,10}\b)/g;

/** Linkify URLs, highlight @mentions and $TICKERS. Plain text otherwise (React escapes it). */
function RichText({ text, myName }: { text: string; myName: string | null }) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN_RE)) {
    const i = m.index ?? 0;
    if (i > last) parts.push(text.slice(last, i));
    if (m[1]) {
      parts.push(<a key={i} href={m[1]} target="_blank" rel="noopener noreferrer nofollow ugc">{m[1].replace(/^https?:\/\//, "").slice(0, 60)}</a>);
    } else if (m[2]) {
      const self = !!myName && m[2].slice(1).toLowerCase() === myName.toLowerCase();
      parts.push(<span key={i} className={"ch-mention" + (self ? " me" : "")}>{m[2]}</span>);
    } else if (m[3]) {
      parts.push(<span key={i} className="ch-ticker">{m[3]}</span>);
    }
    last = i + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

const dayLabel = (t: number) => {
  const d = new Date(t), today = new Date();
  const y = new Date(); y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: d.getFullYear() === today.getFullYear() ? undefined : "numeric" });
};
const clock = (t: number) => new Date(t).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });

function SignInBox({ compact }: { compact?: boolean }) {
  const c = useChat();
  const toast = useToast();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<"wallet" | "guest" | null>(null);
  const run = async (kind: "wallet" | "guest", fn: () => Promise<void>) => {
    setBusy(kind);
    try { await fn(); toast("Signed in", "check"); } catch (e) { toast(errText(e), "warn"); } finally { setBusy(null); }
  };
  return (
    <div className={"ch-signin" + (compact ? " compact" : "")}>
      <button className="btn btn-primary btn-sm" disabled={!!busy} onClick={() => run("wallet", c.signIn)}>
        <Wallet className="ico ico-sm" />{busy === "wallet" ? "Check your wallet…" : "Sign in with wallet"}
      </button>
      {c.session?.allowGuests && (
        <form className="ch-guest" onSubmit={e => { e.preventDefault(); if (name.trim()) run("guest", () => c.setGuestName(name.trim())); }}>
          <input value={name} onChange={e => setName(e.target.value.replace(/[^A-Za-z0-9_]/g, "").slice(0, 20))} placeholder="or pick a guest name" aria-label="Guest name" />
          <button className="btn btn-sm" disabled={!!busy || name.length < 3}>Join</button>
        </form>
      )}
      {!compact && <p className="muted">Signing is free and gasless. It proves you own the address; we never ask for approvals in chat.</p>}
    </div>
  );
}

function Composer({ room, replyTo, onCancelReply, slowModeSec }: { room: ChatRoomId; replyTo: ChatMessage | null; onCancelReply(): void; slowModeSec: number }) {
  const c = useChat();
  const toast = useToast();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const ta = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { if (replyTo) ta.current?.focus(); }, [replyTo]);
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown(s => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);
  useLayoutEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = Math.min(140, el.scrollHeight) + "px";
  }, [text]);

  const canPost = !!c.session?.authorId;
  if (!c.session) return <div className="ch-composer"><div className="muted" style={{ fontSize: 13 }}>Loading…</div></div>;
  if (!canPost) return <div className="ch-composer"><SignInBox compact /></div>;

  const submit = async () => {
    const t = text.trim();
    if (!t || sending || cooldown) return;
    setSending(true);
    try {
      await c.send(room, t, replyTo?.id);
      setText("");
      onCancelReply();
      if (slowModeSec && !c.session?.admin) setCooldown(slowModeSec);
    } catch (e) {
      const msg = errText(e);
      const secs = /wait (\d+)s/.exec(msg)?.[1];
      if (secs) setCooldown(Number(secs));
      toast(msg, "warn");
    } finally {
      setSending(false);
      ta.current?.focus();
    }
  };

  const left = CHAT_MAX_LEN - text.length;
  return (
    <div className="ch-composer">
      {replyTo && (
        <div className="ch-replying">
          <MessageSquareReply className="ico ico-sm" />
          <span>Replying to <b>{replyTo.author.name}</b>: {replyTo.text.slice(0, 80)}</span>
          <button aria-label="Cancel reply" onClick={onCancelReply}><X className="ico ico-sm" /></button>
        </div>
      )}
      <div className="ch-input">
        <textarea
          ref={ta}
          rows={1}
          value={text}
          maxLength={CHAT_MAX_LEN}
          placeholder={cooldown ? `Slow mode: ${cooldown}s` : `Message #${room}`}
          aria-label={`Message #${room}`}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void submit(); }
            if (e.key === "Escape") onCancelReply();
          }}
        />
        <button className="btn btn-primary btn-sm ch-send" aria-label="Send" disabled={!text.trim() || sending || cooldown > 0} onClick={submit}>
          {cooldown ? <span className="mono">{cooldown}</span> : <Send className="ico ico-sm" />}
        </button>
      </div>
      <div className="ch-meta">
        <span>
          {c.session.name ? <>as <b>{c.session.name}</b>{c.session.address ? <BadgeCheck className="ico ico-sm ch-verified" /> : <span className="ch-badge">guest</span>}</> : null}
          {c.session.address && <button className="ch-link" onClick={() => c.signOut().catch(e => toast(errText(e), "warn"))}><LogOut className="ico ico-sm" />Sign out</button>}
        </span>
        <span className={left < 60 ? (left < 0 ? "down" : "warnc") : ""}>{left < 120 ? left : "Enter to send · Shift+Enter for new line"}</span>
      </div>
    </div>
  );
}

function MessageRow({ m, compact, onReply, room }: { m: ChatMessage; compact: boolean; onReply(m: ChatMessage): void; room: ChatRoomId }) {
  const c = useChat();
  const toast = useToast();
  const mine = !!c.me && c.me === m.author.id;
  const admin = !!c.session?.admin;
  const myName = c.session?.name ?? null;
  const mentionsMe = !!myName && m.text.toLowerCase().includes("@" + myName.toLowerCase());
  const act = (fn: () => Promise<void>, ok: string) => fn().then(() => toast(ok, "check")).catch(e => toast(errText(e), "warn"));
  const isSystem = m.author.id === "system";

  return (
    <div className={"ch-msg" + (compact ? " compact" : "") + (mentionsMe ? " mention" : "") + (isSystem ? " system" : "")}>
      <div className="ch-gutter">{compact ? <span className="ch-time-h">{clock(m.t)}</span> : <Avatar m={m} />}</div>
      <div className="ch-body">
        {!compact && (
          <div className="ch-head">
            <span className="ch-name" style={{ color: isSystem ? "var(--cyan)" : `hsl(${hue(m.author.id)} 70% 72%)` }}>{m.author.name}</span>
            {m.author.admin && <span className="ch-badge team"><ShieldCheck className="ico ico-sm" />TEAM</span>}
            {!m.author.admin && m.author.kind === "wallet" && <BadgeCheck className="ico ico-sm ch-verified" aria-label="Wallet verified" />}
            {m.author.kind === "guest" && <span className="ch-badge">guest</span>}
            <time dateTime={new Date(m.t).toISOString()} title={new Date(m.t).toLocaleString()}>{clock(m.t)}</time>
          </div>
        )}
        {m.replyTo && (
          <div className="ch-quote"><b>{m.replyTo.name}</b> {m.replyTo.text}</div>
        )}
        <div className="ch-text"><RichText text={m.text} myName={myName} /></div>
      </div>
      {!isSystem && (
        <div className="ch-actions" role="toolbar" aria-label="Message actions">
          {c.session?.authorId && <button title="Reply" aria-label="Reply" onClick={() => onReply(m)}><MessageSquareReply className="ico ico-sm" /></button>}
          <button title="Copy" aria-label="Copy text" onClick={() => navigator.clipboard?.writeText(m.text).then(() => toast("Copied", "check"))}><Copy className="ico ico-sm" /></button>
          {admin && <button title="Pin" aria-label="Pin message" onClick={() => act(() => c.pin(room, m.id), "Pinned")}><Pin className="ico ico-sm" /></button>}
          {admin && !mine && <button title="Mute 1h + purge" aria-label="Mute author" onClick={() => { if (confirm(`Mute ${m.author.name} for 1 hour and remove their messages?`)) act(() => c.mute(m.author.id, 60, true), "Muted"); }}><VolumeX className="ico ico-sm" /></button>}
          {(mine || admin) && <button title="Delete" aria-label="Delete message" className="danger" onClick={() => act(() => c.remove(room, m.id), "Deleted")}><Trash2 className="ico ico-sm" /></button>}
        </div>
      )}
    </div>
  );
}

function MessageList({ room, onReply }: { room: ChatRoomId; onReply(m: ChatMessage): void }) {
  const c = useChat();
  const list = c.messages[room] ?? [];
  const box = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const [newCount, setNewCount] = useState(0);
  const lastLen = useRef(list.length);
  const prevFirstT = useRef<number>(list[0]?.t ?? 0);
  const prevHeight = useRef(0);

  const toBottom = useCallback((smooth = false) => {
    const el = box.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
    setNewCount(0);
  }, []);

  // room switch: jump to bottom
  useLayoutEffect(() => {
    const l = c.messages[room] ?? [];
    stick.current = true;
    lastLen.current = l.length;
    prevFirstT.current = l[0]?.t ?? 0;
    prevHeight.current = 0;
    toBottom();
  }, [room]); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    // older messages were prepended: keep the viewport anchored
    if (list[0] && prevFirstT.current && list[0].t < prevFirstT.current && prevHeight.current) {
      el.scrollTop += el.scrollHeight - prevHeight.current;
    } else if (list.length > lastLen.current) {
      if (stick.current) toBottom();
      else setNewCount(n => n + (list.length - lastLen.current));
    }
    prevFirstT.current = list[0]?.t ?? 0;
    prevHeight.current = el.scrollHeight;
    lastLen.current = list.length;
  }, [list, toBottom]);

  const onScroll = () => {
    const el = box.current!;
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (stick.current && newCount) setNewCount(0);
    prevHeight.current = el.scrollHeight;
  };

  return (
    <div className="ch-list-wrap">
      <div className="ch-list" ref={box} onScroll={onScroll} role="log" aria-live="polite" aria-label={`#${room} messages`}>
        {c.hasMore[room] && <button className="ch-older" onClick={() => c.loadOlder(room)}>Load earlier messages</button>}
        {c.status !== "live" && list.length === 0 && <div className="ch-empty">Connecting to chat…</div>}
        {c.status === "live" && list.length === 0 && <div className="ch-empty">No messages in #{room} yet. Say gm.</div>}
        {list.map((m, i) => {
          const prev = list[i - 1];
          const newDay = !prev || new Date(prev.t).toDateString() !== new Date(m.t).toDateString();
          const compact = !!prev && !newDay && !m.replyTo && prev.author.id === m.author.id && m.t - prev.t < GROUP_MS;
          return (
            <Fragment key={m.id}>
              {newDay && <div className="ch-day"><span>{dayLabel(m.t)}</span></div>}
              <MessageRow m={m} compact={compact} onReply={onReply} room={room} />
            </Fragment>
          );
        })}
      </div>
      {newCount > 0 && (
        <button className="ch-jump" onClick={() => { stick.current = true; toBottom(true); }}>
          <ArrowDown className="ico ico-sm" />{newCount} new message{newCount > 1 ? "s" : ""}
        </button>
      )}
    </div>
  );
}

function RoomAdmin({ room }: { room: ChatRoomId }) {
  const c = useChat();
  const toast = useToast();
  const info = c.rooms.find(r => r.id === room);
  if (!c.session?.admin || !info) return null;
  return (
    <div className="ch-card">
      <h4><ShieldCheck className="ico ico-sm" />Moderation</h4>
      <label className="ch-field">
        <span>Slow mode</span>
        <select value={info.slowModeSec} onChange={e => c.slowMode(room, Number(e.target.value)).catch(err => toast(errText(err), "warn"))}>
          {[0, 5, 10, 30, 60, 120, 300].map(s => <option key={s} value={s}>{s ? `${s}s` : "Off"}</option>)}
        </select>
      </label>
      {info.pinned && <button className="btn btn-sm btn-block" onClick={() => c.pin(room, null).catch(err => toast(errText(err), "warn"))}><PinOff className="ico ico-sm" />Unpin message</button>}
    </div>
  );
}

export function ChatPanel({ variant = "full", initialRoom = "general" }: { variant?: "full" | "dock"; initialRoom?: ChatRoomId }) {
  const c = useChat();
  const [room, setRoom] = useState<ChatRoomId>(initialRoom);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const info = useMemo(() => c.rooms.find(r => r.id === room), [c.rooms, room]);
  const { setActive } = c;

  useEffect(() => { setActive(room); return () => setActive(null); }, [room, setActive]);
  useEffect(() => {
    const onVis = () => { if (!document.hidden) setActive(room); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [room, setActive]);

  const switchRoom = (r: ChatRoomId) => { setRoom(r); setReplyTo(null); };
  const statusPill = (
    <span className={"pill live " + (c.status === "live" ? "mint" : "warn")} style={{ height: 22, fontSize: 11 }}>
      <span className="dot" />{c.status === "live" ? `${c.online} online` : c.status === "reconnecting" ? "Reconnecting" : "Connecting"}
    </span>
  );

  const pinned = info?.pinned && (
    <div className="ch-pinned"><Pin className="ico ico-sm" /><span><b>{info.pinned.author.name}:</b> {info.pinned.text}</span></div>
  );

  if (variant === "dock") {
    return (
      <div className="ch ch-dock">
        <div className="ch-dock-h">
          <div className="ch-tabs" role="tablist">
            {(c.rooms.length ? c.rooms : [{ id: room, name: room }]).map(r => (
              <button key={r.id} role="tab" aria-selected={room === r.id} className={room === r.id ? "on" : ""} onClick={() => switchRoom(r.id as ChatRoomId)}>
                #{r.name}{(c.unread[r.id] ?? 0) > 0 && room !== r.id && <i>{Math.min(99, c.unread[r.id])}</i>}
              </button>
            ))}
          </div>
          {statusPill}
        </div>
        {pinned}
        <MessageList room={room} onReply={setReplyTo} />
        <Composer room={room} replyTo={replyTo} onCancelReply={() => setReplyTo(null)} slowModeSec={info?.slowModeSec ?? 0} />
      </div>
    );
  }

  return (
    <div className="ch ch-full">
      <aside className="ch-rooms">
        <div className="ch-rooms-h"><span>Channels</span>{statusPill}</div>
        <nav aria-label="Chat channels">
          {c.rooms.map(r => (
            <button key={r.id} className={room === r.id ? "on" : ""} onClick={() => switchRoom(r.id)}>
              <Hash className="ico ico-sm" /><span>{r.name}</span>
              {r.slowModeSec > 0 && <Timer className="ico ico-sm muted" aria-label="Slow mode" />}
              {(c.unread[r.id] ?? 0) > 0 && room !== r.id && <i>{Math.min(99, c.unread[r.id])}</i>}
            </button>
          ))}
        </nav>
      </aside>
      <section className="ch-main">
        <header className="ch-main-h">
          <Hash className="ico" /><b>{info?.name ?? room}</b>
          <span className="ch-topic">{info?.topic}</span>
          {info && info.slowModeSec > 0 && <span className="tag"><Timer className="ico ico-sm" style={{ marginRight: 4 }} />{info.slowModeSec}s slow mode</span>}
        </header>
        {pinned}
        <MessageList room={room} onReply={setReplyTo} />
        <Composer room={room} replyTo={replyTo} onCancelReply={() => setReplyTo(null)} slowModeSec={info?.slowModeSec ?? 0} />
      </section>
      <aside className="ch-info">
        <div className="ch-card">
          <h4><Users className="ico ico-sm" />Community</h4>
          <div className="ch-kv"><span>Online now</span><b>{c.online}</b></div>
          <div className="ch-kv"><span>Signed in as</span><b>{c.session?.name ?? "—"}</b></div>
          {!c.session?.authorId && c.session && <SignInBox />}
        </div>
        <RoomAdmin room={room} />
        <div className="ch-card">
          <h4>Rules</h4>
          <ol className="ch-rules">
            <li>Be respectful. No harassment or hate.</li>
            <li>No shilling other tokens or spam.</li>
            <li>Never share a seed phrase or private key.</li>
            <li>The team never DMs first. Admins carry a <b>TEAM</b> badge.</li>
            <li>Nothing here is financial advice.</li>
          </ol>
        </div>
      </aside>
    </div>
  );
}
