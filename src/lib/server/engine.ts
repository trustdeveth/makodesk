import "server-only";
import type { BookLevel, Candle, DeskState, MarketState, MarketSymbol, Trade } from "../types";
import { MARKETS, TIMEFRAMES, type MarketSpec, type Timeframe } from "../markets";
import { MOODS, moodFor } from "../moods";
import { hyperliquid } from "./hyperliquid";
import { deskChain } from "./deskChain";

/**
 * Preview market engine.
 * One instance per server process (stored on globalThis so dev hot-reload doesn't
 * spawn duplicates). Every connected client sees the same stream.
 * It simulates what the HyperCore precompile + MakoDesk contract will expose,
 * plus the two terminal markets (HYPE-PERP, MAKO-USD) with candle history.
 */

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const gauss = () => {
  let u = 0, v = 0;
  while (!u) u = Math.random();
  while (!v) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};
const hash = () => "0x" + Array.from({ length: 64 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");

const MIN = 60_000, HOUR = 3_600_000;
const M1_KEEP = 7 * 24 * 60;  // 7 days of 1m candles
const H1_KEEP = 180 * 24;     // 180 days of 1h candles

type Listener = (s: DeskState) => void;

/** Log-price random walk with mean reversion toward `anchor`. */
function walk(n: number, start: number, sigma: number, anchor: number, revert: number): number[] {
  const out: number[] = [];
  let p = start;
  for (let i = 0; i < n; i++) {
    p = p * Math.exp(gauss() * sigma + Math.log(anchor / p) * revert);
    out.push(p);
  }
  return out;
}

function barsFromCloses(closes: number[], t0: number, step: number, open: number, sigma: number, vol: () => number): Candle[] {
  const bars: Candle[] = [];
  let o = open;
  closes.forEach((c, i) => {
    const h = Math.max(o, c) * (1 + Math.abs(gauss()) * sigma * 0.35);
    const l = Math.min(o, c) * (1 - Math.abs(gauss()) * sigma * 0.35);
    bars.push({ t: t0 + i * step, o, h, l, c, v: vol() });
    o = c;
  });
  return bars;
}

class MarketSim {
  spec: MarketSpec;
  mid: number;
  m1: Candle[] = [];
  h1: Candle[] = [];
  bar: Candle;
  trades: Trade[] = [];
  book: MarketState["book"] = { bids: [], asks: [], spread: 0 };
  stats = { open24h: 0, high24h: 0, low24h: 0, vol24h: 0 };
  private szScale: number;
  private tradeSize: () => number;

  constructor(spec: MarketSpec, mid: number, o: { sigma1m: number; anchor: number; szScale: number; tradeSize: () => number; volPerMin: () => number }) {
    this.spec = spec;
    this.mid = mid;
    this.szScale = o.szScale;
    this.tradeSize = o.tradeSize;

    const now = Date.now();
    const curMin = Math.floor(now / MIN) * MIN;
    const curHour = Math.floor(now / HOUR) * HOUR;

    // 1m history ending at the current mid
    let closes = walk(M1_KEEP, mid, o.sigma1m, o.anchor, 0.004);
    const k = mid / closes[closes.length - 1];
    closes = closes.map(c => c * k);
    const m1Start = curMin - M1_KEEP * MIN;
    this.m1 = barsFromCloses(closes, m1Start, MIN, closes[0] / (1 + gauss() * o.sigma1m), o.sigma1m, o.volPerMin);

    // 1h history: older hours walked backward from the first 1m open, recent hours aggregated from 1m
    const firstHour = Math.floor(m1Start / HOUR) * HOUR;
    const olderHours = Math.max(0, H1_KEEP - Math.round((curHour - firstHour) / HOUR));
    const sigma1h = o.sigma1m * Math.sqrt(60);
    const back = walk(olderHours, this.m1[0].o, sigma1h, o.anchor, 0.01).reverse();
    const hVol = () => o.volPerMin() * 60;
    this.h1 = olderHours ? barsFromCloses([...back.slice(1), this.m1[0].o], firstHour - olderHours * HOUR, HOUR, back[0], sigma1h, hVol) : [];
    for (const b of this.m1) this.mergeHour(b);

    this.bar = { t: curMin, o: mid, h: mid, l: mid, c: mid, v: 0 };
    this.computeStats();
  }

  /** Fold a closed 1m bar into the hourly store. */
  private mergeHour(b: Candle) {
    const ht = Math.floor(b.t / HOUR) * HOUR;
    const last = this.h1[this.h1.length - 1];
    if (last && last.t === ht) {
      last.h = Math.max(last.h, b.h); last.l = Math.min(last.l, b.l); last.c = b.c; last.v += b.v;
    } else {
      this.h1.push({ ...b, t: ht });
      if (this.h1.length > H1_KEEP) this.h1.shift();
    }
  }

  step(now: number, mid: number) {
    this.mid = mid;
    const minute = Math.floor(now / MIN) * MIN;
    if (minute !== this.bar.t) {
      this.m1.push(this.bar);
      if (this.m1.length > M1_KEEP) this.m1.shift();
      this.mergeHour(this.bar);
      this.bar = { t: minute, o: this.bar.c, h: this.bar.c, l: this.bar.c, c: this.bar.c, v: 0 };
      this.computeStats();
    }
    const d = this.spec.pxDecimals;
    const side: Trade["side"] = Math.random() < 0.5 ? "buy" : "sell";
    const px = +(mid + (side === "buy" ? 1 : -1) * this.spec.tick).toFixed(d);
    const sz = +this.tradeSize().toFixed(this.spec.szDecimals || 1);
    this.trades.unshift({ t: now, px, sz, side });
    if (this.trades.length > 50) this.trades.length = 50;
    const b = this.bar;
    b.h = Math.max(b.h, mid); b.l = Math.min(b.l, mid); b.c = mid; b.v += sz;
  }

  computeStats() {
    const cut = Date.now() - 24 * HOUR;
    let i = this.m1.length - 1;
    let hi = this.bar.h, lo = this.bar.l, vol = 0, open = this.bar.o;
    while (i >= 0 && this.m1[i].t >= cut) {
      const c = this.m1[i];
      if (c.h > hi) hi = c.h;
      if (c.l < lo) lo = c.l;
      vol += c.v; open = c.o; i--;
    }
    this.stats = { open24h: open, high24h: hi, low24h: lo, vol24h: vol };
  }

  buildBook(spreadTicks: number) {
    const { tick, pxDecimals: d } = this.spec;
    const half = (spreadTicks * tick) / 2;
    const bestBid = +(this.mid - half).toFixed(d);
    const bestAsk = Math.max(+(this.mid + half).toFixed(d), +(bestBid + tick).toFixed(d));
    const bids: BookLevel[] = [], asks: BookLevel[] = [];
    let cb = 0, ca = 0, lastB = bestBid + tick, lastA = bestAsk - tick;
    for (let i = 0; i < 24; i++) {
      const sb = Math.max(20, Math.abs(gauss()) * 900 + i * 120 + (Math.random() < 0.08 ? 4000 : 0)) * this.szScale;
      const sa = Math.max(20, Math.abs(gauss()) * 900 + i * 120 + (Math.random() < 0.08 ? 4000 : 0)) * this.szScale;
      cb += sb; ca += sa;
      // ensure strictly monotonic prices after rounding to tick
      const pb = Math.min(+(bestBid - i * tick * (1 + i * 0.15)).toFixed(d), +(lastB - tick).toFixed(d));
      const pa = Math.max(+(bestAsk + i * tick * (1 + i * 0.15)).toFixed(d), +(lastA + tick).toFixed(d));
      lastB = pb; lastA = pa;
      bids.push({ px: pb, sz: Math.round(sb), cum: Math.round(cb), desk: i === 0 || i === 3 });
      asks.push({ px: pa, sz: Math.round(sa), cum: Math.round(ca), desk: i === 0 || i === 3 });
    }
    this.book = { bids, asks, spread: +(bestAsk - bestBid).toFixed(d) };
  }

  /** Candles for any timeframe, oldest first, including the live (unclosed) bar. */
  candles(tf: Timeframe, limit: number): Candle[] {
    const ms = TIMEFRAMES[tf];
    const src = ms >= HOUR ? [...this.h1, this.hbarLive()] : [...this.m1, this.bar];
    if (ms === MIN) return src.slice(-limit).map(c => ({ ...c }));
    const out: Candle[] = [];
    for (const c of src) {
      const t = Math.floor(c.t / ms) * ms;
      const last = out[out.length - 1];
      if (last && last.t === t) {
        last.h = Math.max(last.h, c.h); last.l = Math.min(last.l, c.l); last.c = c.c; last.v += c.v;
      } else out.push({ ...c, t });
    }
    return out.slice(-limit);
  }

  private hbarLive(): Candle {
    // current hour = closed 1m bars of this hour + live bar
    const ht = Math.floor(this.bar.t / HOUR) * HOUR;
    const last = this.h1[this.h1.length - 1];
    if (last && last.t === ht) {
      return { ...last, h: Math.max(last.h, this.bar.h), l: Math.min(last.l, this.bar.l), c: this.bar.c, v: last.v + this.bar.v };
    }
    return { ...this.bar, t: ht };
  }

  state(): MarketState {
    const { open24h, high24h, low24h, vol24h } = this.stats;
    return {
      symbol: this.spec.symbol,
      mid: this.mid,
      open24h,
      high24h: Math.max(high24h, this.bar.h),
      low24h: Math.min(low24h, this.bar.l),
      vol24h: vol24h + this.bar.v,
      change24h: open24h ? ((this.mid - open24h) / open24h) * 100 : 0,
      book: this.book,
      trades: this.trades.slice(0, 40),
      bar: { ...this.bar },
    };
  }
}

class Engine {
  s: DeskState;
  listeners = new Set<Listener>();
  wickArmed = false;
  tick = 0;
  timer: NodeJS.Timeout | null = null;
  markets: Record<MarketSymbol, MarketSim>;

  constructor() {
    const history: number[] = [];
    let acc = 37_800;
    for (let i = 0; i < 96; i++) { acc += gauss() * 60 + 22; history.push(acc); }
    const burns = Array.from({ length: 8 }, (_, i) => ({
      t: Date.now() - (i + 1) * rand(9, 25) * 60_000,
      amount: Math.round(rand(40_000, 420_000)),
      reason: (Math.random() < 0.25 ? "Wick bonus" : "Desk profit") as "Wick bonus" | "Desk profit",
      tx: hash(),
    }));

    this.markets = {
      "HYPE-PERP": new MarketSim(MARKETS["HYPE-PERP"], 38.42, {
        sigma1m: 0.0022, anchor: 38.4, szScale: 1,
        tradeSize: () => Math.abs(gauss()) * 140 + 2, volPerMin: () => rand(6_000, 22_000),
      }),
      "MAKO-USD": new MarketSim(MARKETS["MAKO-USD"], 0.004182, {
        sigma1m: 0.004, anchor: 0.0042, szScale: 2_500,
        tradeSize: () => Math.abs(gauss()) * 400_000 + 5_000, volPerMin: () => rand(8e6, 3e7),
      }),
    };
    const mako = this.markets["MAKO-USD"];

    this.s = {
      mode: "preview",
      t: Date.now(),
      mid: 38.42,
      midOpen: 38.42,
      funding: 0.0011,
      makoPrice: 0.004182,
      makoChange: 0,
      supply: 1_000_000_000,
      burned: 18_442_903,
      holders: 4128,
      treasury: { hype: 61_240, mako: 196_800_000, usd: 0 },
      pnl: { total: acc, session: 0, history },
      fills: [],
      burns,
      trades: [],
      book: { bids: [], asks: [], spread: 0 },
      mood: moodFor(0.0011),
      latency: 212,
      coreBlock: 512_884_210,
      elyBlock: 18_221_904,
      risk: { positionPct: 30, lossPct: 12, skewPct: 50, paused: false },
      markets: [],
      sources: { market: "preview", desk: "preview" },
      live: { market: false, desk: false, token: false },
      wick: { armed: false, at: null, dropPct: 0 },
    };
    hyperliquid.start();
    this.s.makoChange = +mako.state().change24h.toFixed(2);
    this.buildBooks();
    this.s.treasury.usd = this.s.treasury.hype * this.s.mid + this.s.treasury.mako * this.s.makoPrice;
    this.publishMarkets();
  }

  buildBooks() {
    const s = this.s;
    const hypeTicks = s.mood.key === "circling" ? 6 : s.mood.key === "breach" ? 12 : 2;
    this.markets["HYPE-PERP"].buildBook(hypeTicks);
    this.markets["MAKO-USD"].buildBook(s.mood.key === "breach" ? 8 : 3);
    const hb = this.markets["HYPE-PERP"].book;
    // legacy desk view shows the top 18 levels of HYPE-PERP
    s.book = { bids: hb.bids.slice(0, 18), asks: hb.asks.slice(0, 18), spread: hb.spread };
  }

  publishMarkets() {
    const live = hyperliquid.market();
    this.s.markets = [live ?? this.markets["HYPE-PERP"].state(), this.markets["MAKO-USD"].state()];
    this.s.sources.market = live ? "hyperliquid" : "preview";
    if (live) {
      // legacy desk view reads s.book / s.trades
      this.s.book = { bids: live.book.bids.slice(0, 18), asks: live.book.asks.slice(0, 18), spread: live.book.spread };
      this.s.trades = live.trades.slice(0, 24);
    }
  }

  /** Off-chain wick detector: same rule as MakoDesk (drop within a short window + forced flow). */
  private wickRing: { t: number; mid: number }[] = [];
  private breachUntil = 0;
  senseLive(now: number, mid: number) {
    const W = Number(process.env.WICK_WINDOW_MS) || 3_000;
    const DROP = Number(process.env.WICK_DROP_PCT) || 1.5;
    const FLOW = Number(process.env.WICK_FLOW_USD) || 1_000_000;
    this.wickRing.push({ t: now, mid });
    while (this.wickRing.length && this.wickRing[0].t < now - W) this.wickRing.shift();
    const hi = Math.max(...this.wickRing.map(x => x.mid));
    const dropPct = hi > 0 ? ((hi - mid) / hi) * 100 : 0;
    if (dropPct >= DROP && hyperliquid.flowUsd(W) >= FLOW) {
      if (now >= this.breachUntil) this.s.wick.at = now;
      this.breachUntil = now + 5 * 60_000;
      this.wickArmed = true;
    }
    this.s.wick = { armed: now < this.breachUntil, at: this.s.wick.at, dropPct: +dropPct.toFixed(3) };
    const breach = MOODS.find(m => m.key === "breach")!;
    this.s.mood = now < this.breachUntil ? { key: breach.key, label: breach.label, desc: breach.desc, color: breach.color } : moodFor(this.s.funding);
  }

  step() {
    const s = this.s;
    const now = Date.now();
    this.tick++;
    s.t = now;

    const live = hyperliquid.market();
    if (live && hyperliquid.ctx) {
      // Phase 2: real HYPE-PERP market, real funding, real mood + wick detector
      s.mid = live.mid;
      s.funding = hyperliquid.ctx.funding;
      this.senseLive(now, live.mid);
    } else {
      let shock = gauss() * 0.018;
      if (Math.random() < 0.003) { shock = -rand(0.35, 0.9); this.wickArmed = true; }
      s.mid = Math.max(5, s.mid + shock + (38.4 - s.mid) * 0.002);
      s.funding += gauss() * 0.00025 + (0.0012 - s.funding) * 0.01;
      if (this.wickArmed) s.funding = Math.max(s.funding, 0.013);
      s.mood = moodFor(s.funding);
      s.wick = { armed: this.wickArmed, at: this.wickArmed ? now : s.wick.at, dropPct: 0 };
    }

    // MAKO: real price from the LP pair once configured; otherwise mean-reverting preview noise
    if (deskChain.makoPriceHype !== null) s.makoPrice = deskChain.makoPriceHype * s.mid;
    else s.makoPrice = Math.max(0.0001, s.makoPrice * Math.exp(gauss() * 0.0012 + Math.log(0.0042 / s.makoPrice) * 0.0004));
    s.latency = Math.round(150 + Math.abs(gauss()) * 90);
    s.coreBlock += 3 + Math.round(Math.random() * 2);
    s.elyBlock += 4;

    this.markets["HYPE-PERP"].step(now, +s.mid.toFixed(3));
    this.markets["MAKO-USD"].step(now, +s.makoPrice.toFixed(6));
    if (!live) s.trades = this.markets["HYPE-PERP"].trades.slice(0, 24);

    if (Math.random() < 0.3) {
      const fs = Math.random() < 0.5 ? "buy" : "sell";
      const edge = +rand(0.4, 2.2).toFixed(2);
      s.fills.unshift({ t: now, market: Math.random() < 0.8 ? "HYPE-PERP" : "MAKO/HYPE", side: fs, px: +s.mid.toFixed(3), sz: +rand(8, 120).toFixed(1), edge });
      if (s.fills.length > 20) s.fills.length = 20;
      s.pnl.total += edge;
      s.pnl.session += edge;
    }
    if (this.tick % 4 === 0) {
      s.pnl.history.push(s.pnl.total);
      if (s.pnl.history.length > 120) s.pnl.history.shift();
    }

    if (Math.random() < 0.016 || this.wickArmed) {
      const amt = Math.round(this.wickArmed ? rand(500_000, 1_400_000) : rand(30_000, 260_000));
      s.burned += amt;
      s.burns.unshift({ t: now, amount: amt, reason: this.wickArmed ? "Wick bonus" : "Desk profit", tx: hash() });
      if (s.burns.length > 25) s.burns.length = 25;
      this.wickArmed = false;
    }

    const k = this.tick;
    s.risk = {
      positionPct: +(30 + Math.sin(k / 40) * 18 + Math.random() * 4).toFixed(1),
      lossPct: +Math.max(2, 14 + Math.cos(k / 55) * 10).toFixed(1),
      skewPct: +(50 + Math.sin(k / 30) * 22).toFixed(1),
      paused: s.mood.key === "breach",
    };

    s.treasury.usd = s.treasury.hype * s.mid + s.treasury.mako * s.makoPrice;
    this.buildBooks();
    this.publishMarkets();
    s.makoChange = +this.s.markets[1].change24h.toFixed(2);
    this.listeners.forEach(fn => { try { fn(s); } catch { /* listener errors never kill the engine */ } });
  }

  ensureRunning() {
    if (!this.timer) {
      this.timer = setInterval(() => this.step(), 500);
      this.timer.unref?.();
    }
  }

  subscribe(fn: Listener) {
    this.ensureRunning();
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  snapshot(): DeskState {
    this.ensureRunning();
    return this.s;
  }

  candles(symbol: MarketSymbol, tf: Timeframe, limit: number): Candle[] {
    this.ensureRunning();
    return this.markets[symbol].candles(tf, limit);
  }

  listenerCount() {
    return this.listeners.size;
  }
}

const g = globalThis as unknown as { __makoEngine?: Engine; __makoEngineV?: number };
// bump when the Engine shape changes so dev hot-reload picks up a fresh instance
const VERSION = 3;
if (g.__makoEngine && g.__makoEngineV !== VERSION) {
  if (g.__makoEngine.timer) clearInterval(g.__makoEngine.timer);
  g.__makoEngine = undefined;
}
export const engine: Engine = g.__makoEngine ?? (g.__makoEngine = new Engine());
g.__makoEngineV = VERSION;
