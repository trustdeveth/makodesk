import "server-only";
import type { BookLevel, Candle, MarketState, Trade } from "../types";
import type { Timeframe } from "../markets";

/**
 * Live HYPE-PERP market data from Hyperliquid's public API (Phase 2 "Sense", off-chain).
 * One WebSocket per server process: l2Book + trades + activeAssetCtx (funding, mark, 24h).
 * Candles come from the REST candleSnapshot endpoint, cached briefly.
 * No keys, no user data: the server only reads public market data.
 */

const WS_URL = process.env.HL_WS_URL?.trim() || "wss://api.hyperliquid.xyz/ws";
const INFO_URL = process.env.HL_INFO_URL?.trim() || "https://api.hyperliquid.xyz/info";
const COIN = "HYPE";
const STALE_MS = 6_000;

interface Ctx { funding: number; markPx: number; midPx: number; oraclePx: number; prevDayPx: number; dayBaseVlm: number; dayNtlVlm: number; openInterest: number }
type RawLevel = { px: string; sz: string; n: number };
type RawTrade = { side: "B" | "A"; px: string; sz: string; time: number; tid: number };

const HL_INTERVAL: Record<Timeframe, string> = { "1m": "1m", "5m": "5m", "15m": "15m", "1h": "1h", "4h": "4h", "1D": "1d" };
const TF_MS: Record<Timeframe, number> = { "1m": 60_000, "5m": 300_000, "15m": 900_000, "1h": 3_600_000, "4h": 14_400_000, "1D": 86_400_000 };

class HyperliquidFeed {
  private ws: WebSocket | null = null;
  private ping: ReturnType<typeof setInterval> | null = null;
  private retry = 0;
  private started = false;
  lastMsgAt = 0;
  bookAt = 0;
  book: { bids: BookLevel[]; asks: BookLevel[]; spread: number } | null = null;
  trades: Trade[] = [];
  ctx: Ctx | null = null;
  bar: Candle | null = null;
  day: { high: number; low: number; at: number } | null = null;
  private candleCache = new Map<string, { at: number; data: Candle[] }>();
  /** trade notional (USD) per second, last 10 s; used by the off-chain wick detector */
  flow: { t: number; usd: number }[] = [];

  enabled() {
    return (process.env.MARKET_DATA ?? "hyperliquid").trim() !== "preview";
  }

  start() {
    if (this.started || !this.enabled() || typeof WebSocket === "undefined") return;
    this.started = true;
    this.connect();
    void this.refreshDayRange();
    const t = setInterval(() => void this.refreshDayRange(), 5 * 60_000);
    t.unref?.();
  }

  fresh() {
    return !!this.book && !!this.ctx && Date.now() - this.bookAt < STALE_MS;
  }

  private connect() {
    let ws: WebSocket;
    try {
      ws = new WebSocket(WS_URL);
    } catch {
      return this.reconnect();
    }
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      for (const sub of [{ type: "l2Book", coin: COIN }, { type: "trades", coin: COIN }, { type: "activeAssetCtx", coin: COIN }]) {
        ws.send(JSON.stringify({ method: "subscribe", subscription: sub }));
      }
      if (this.ping) clearInterval(this.ping);
      this.ping = setInterval(() => { try { ws.send(JSON.stringify({ method: "ping" })); } catch { /* closing */ } }, 30_000);
    };
    ws.onmessage = ev => {
      this.lastMsgAt = Date.now();
      try { this.handle(JSON.parse(String(ev.data))); } catch { /* malformed frame */ }
    };
    ws.onclose = () => this.reconnect();
    ws.onerror = () => { try { ws.close(); } catch { /* already closed */ } };
  }

  private reconnect() {
    if (this.ping) { clearInterval(this.ping); this.ping = null; }
    this.ws = null;
    const delay = Math.min(30_000, 1_000 * 2 ** this.retry++);
    const t = setTimeout(() => this.connect(), delay);
    t.unref?.();
  }

  private handle(msg: { channel?: string; data?: unknown }) {
    if (msg.channel === "l2Book") {
      const d = msg.data as { levels: [RawLevel[], RawLevel[]]; time: number };
      const conv = (ls: RawLevel[]) => {
        let cum = 0;
        return ls.slice(0, 24).map(l => {
          const sz = Number(l.sz);
          cum += sz;
          return { px: Number(l.px), sz, cum, desk: false };
        });
      };
      const bids = conv(d.levels[0]), asks = conv(d.levels[1]);
      if (bids.length && asks.length) {
        this.book = { bids, asks, spread: +(asks[0].px - bids[0].px).toFixed(4) };
        this.bookAt = Date.now();
      }
    } else if (msg.channel === "trades") {
      const ts = msg.data as RawTrade[];
      for (const r of ts) {
        const t: Trade = { t: r.time, px: Number(r.px), sz: Number(r.sz), side: r.side === "B" ? "buy" : "sell" };
        this.trades.unshift(t);
        this.onTradeBar(t);
        const sec = Math.floor(t.t / 1000) * 1000;
        const last = this.flow[this.flow.length - 1];
        if (last && last.t === sec) last.usd += t.px * t.sz; else this.flow.push({ t: sec, usd: t.px * t.sz });
      }
      if (this.trades.length > 60) this.trades.length = 60;
      const cut = Date.now() - 10_000;
      while (this.flow.length && this.flow[0].t < cut) this.flow.shift();
    } else if (msg.channel === "activeAssetCtx") {
      const c = (msg.data as { ctx: Record<string, string> }).ctx;
      this.ctx = {
        funding: Number(c.funding), markPx: Number(c.markPx), midPx: Number(c.midPx ?? c.markPx), oraclePx: Number(c.oraclePx),
        prevDayPx: Number(c.prevDayPx), dayBaseVlm: Number(c.dayBaseVlm), dayNtlVlm: Number(c.dayNtlVlm), openInterest: Number(c.openInterest),
      };
    }
  }

  private onTradeBar(t: Trade) {
    const minute = Math.floor(t.t / 60_000) * 60_000;
    const b = this.bar;
    if (!b || minute > b.t) this.bar = { t: minute, o: b?.c ?? t.px, h: t.px, l: t.px, c: t.px, v: t.sz };
    else if (minute === b.t) { b.h = Math.max(b.h, t.px); b.l = Math.min(b.l, t.px); b.c = t.px; b.v += t.sz; }
  }

  /** Trade notional (USD) over the last `ms`. */
  flowUsd(ms: number) {
    const cut = Date.now() - ms;
    return this.flow.reduce((s, f) => (f.t >= cut ? s + f.usd : s), 0);
  }

  private async refreshDayRange() {
    try {
      const cs = await this.fetchCandles("1h", 25);
      const last24 = cs.slice(-24);
      if (last24.length) this.day = { high: Math.max(...last24.map(c => c.h)), low: Math.min(...last24.map(c => c.l)), at: Date.now() };
    } catch { /* keep the previous range */ }
  }

  private async fetchCandles(tf: Timeframe, limit: number): Promise<Candle[]> {
    const end = Date.now();
    const start = end - TF_MS[tf] * limit;
    const r = await fetch(INFO_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "candleSnapshot", req: { coin: COIN, interval: HL_INTERVAL[tf], startTime: start, endTime: end } }),
      signal: AbortSignal.timeout(8_000),
      cache: "no-store",
    });
    if (!r.ok) throw new Error(`HL candles HTTP ${r.status}`);
    const raw = (await r.json()) as { t: number; o: string; h: string; l: string; c: string; v: string }[];
    return raw.map(c => ({ t: c.t, o: +c.o, h: +c.h, l: +c.l, c: +c.c, v: +c.v }));
  }

  /** Cached candles (15 s TTL per timeframe/limit). Throws if Hyperliquid is unreachable. */
  async candles(tf: Timeframe, limit: number): Promise<Candle[]> {
    const key = `${tf}:${limit}`;
    const hit = this.candleCache.get(key);
    if (hit && Date.now() - hit.at < 15_000) return hit.data;
    const data = await this.fetchCandles(tf, Math.min(limit, 5000));
    this.candleCache.set(key, { at: Date.now(), data });
    if (this.candleCache.size > 40) this.candleCache.delete(this.candleCache.keys().next().value!);
    return data;
  }

  /** Terminal market view built from live data. */
  market(): MarketState | null {
    if (!this.fresh()) return null;
    const book = this.book!, ctx = this.ctx!;
    const mid = (book.bids[0].px + book.asks[0].px) / 2;
    const bar = this.bar && this.bar.t === Math.floor(Date.now() / 60_000) * 60_000 ? { ...this.bar } : { t: Math.floor(Date.now() / 60_000) * 60_000, o: mid, h: mid, l: mid, c: mid, v: 0 };
    return {
      symbol: "HYPE-PERP",
      mid,
      open24h: ctx.prevDayPx,
      high24h: Math.max(this.day?.high ?? mid, mid),
      low24h: Math.min(this.day?.low ?? mid, mid),
      vol24h: ctx.dayBaseVlm,
      change24h: ctx.prevDayPx ? ((mid - ctx.prevDayPx) / ctx.prevDayPx) * 100 : 0,
      book,
      trades: this.trades.slice(0, 40),
      bar,
    };
  }

  status() {
    return { enabled: this.enabled(), connected: this.ws?.readyState === 1, fresh: this.fresh(), lastMsgAgoMs: this.lastMsgAt ? Date.now() - this.lastMsgAt : null };
  }
}

const g = globalThis as unknown as { __makoHL?: HyperliquidFeed };
export const hyperliquid: HyperliquidFeed = g.__makoHL ?? (g.__makoHL = new HyperliquidFeed());
