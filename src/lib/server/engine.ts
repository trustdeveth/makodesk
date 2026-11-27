import "server-only";
import type { BookLevel, DeskState } from "../types";
import { moodFor } from "../moods";

/**
 * Preview market engine.
 * One instance per server process (stored on globalThis so dev hot-reload doesn't
 * spawn duplicates). Every connected client sees the same stream.
 * It simulates what the HyperCore precompile + MakoDesk contract will expose.
 */

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const gauss = () => {
  let u = 0, v = 0;
  while (!u) u = Math.random();
  while (!v) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};
const hash = () => "0x" + Array.from({ length: 64 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");

type Listener = (s: DeskState) => void;

class Engine {
  s: DeskState;
  listeners = new Set<Listener>();
  wickArmed = false;
  tick = 0;
  timer: NodeJS.Timeout | null = null;

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
    this.s = {
      mode: "preview",
      t: Date.now(),
      mid: 38.42,
      midOpen: 38.42,
      funding: 0.0011,
      makoPrice: 0.004182,
      makoChange: 6.4,
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
    };
    this.buildBook();
    this.s.treasury.usd = this.s.treasury.hype * this.s.mid + this.s.treasury.mako * this.s.makoPrice;
  }

  buildBook() {
    const s = this.s;
    const tick = 0.001;
    const spread = s.mood.key === "circling" ? 0.006 : s.mood.key === "breach" ? 0.012 : 0.002;
    const bestBid = +(s.mid - spread / 2).toFixed(3);
    const bestAsk = +(s.mid + spread / 2).toFixed(3);
    const bids: BookLevel[] = [], asks: BookLevel[] = [];
    let cb = 0, ca = 0;
    for (let i = 0; i < 18; i++) {
      const sb = Math.max(20, Math.abs(gauss()) * 900 + i * 120 + (Math.random() < 0.08 ? 4000 : 0));
      const sa = Math.max(20, Math.abs(gauss()) * 900 + i * 120 + (Math.random() < 0.08 ? 4000 : 0));
      cb += sb; ca += sa;
      bids.push({ px: +(bestBid - i * tick * (1 + i * 0.15)).toFixed(3), sz: Math.round(sb), cum: Math.round(cb), desk: i === 0 || i === 3 });
      asks.push({ px: +(bestAsk + i * tick * (1 + i * 0.15)).toFixed(3), sz: Math.round(sa), cum: Math.round(ca), desk: i === 0 || i === 3 });
    }
    s.book = { bids, asks, spread: +(bestAsk - bestBid).toFixed(3) };
  }

  step() {
    const s = this.s;
    const now = Date.now();
    this.tick++;
    s.t = now;

    let shock = gauss() * 0.018;
    if (Math.random() < 0.003) { shock = -rand(0.35, 0.9); this.wickArmed = true; }
    s.mid = Math.max(5, s.mid + shock + (38.4 - s.mid) * 0.002);

    s.funding += gauss() * 0.00025 + (0.0012 - s.funding) * 0.01;
    if (this.wickArmed) s.funding = Math.max(s.funding, 0.013);
    s.mood = moodFor(s.funding);

    s.makoPrice = Math.max(0.0001, s.makoPrice * (1 + gauss() * 0.0012 + 0.00008));
    s.latency = Math.round(150 + Math.abs(gauss()) * 90);
    s.coreBlock += 3 + Math.round(Math.random() * 2);
    s.elyBlock += 4;

    const side = Math.random() < 0.5 ? "buy" : "sell";
    s.trades.unshift({ t: now, px: +(s.mid + (side === "buy" ? 0.001 : -0.001)).toFixed(3), sz: +(Math.abs(gauss()) * 140 + 2).toFixed(1), side });
    if (s.trades.length > 24) s.trades.length = 24;

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
    this.buildBook();
    this.listeners.forEach(fn => { try { fn(s); } catch { /* listener errors never kill the engine */ } });
  }

  ensureRunning() {
    if (!this.timer) this.timer = setInterval(() => this.step(), 500);
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
}

const g = globalThis as unknown as { __makoEngine?: Engine };
export const engine: Engine = g.__makoEngine ?? (g.__makoEngine = new Engine());
