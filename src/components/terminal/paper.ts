import { MARKETS } from "@/lib/markets";
import type { BookLevel, MarketState, MarketSymbol } from "@/lib/types";

/**
 * Paper-trading engine for the terminal (pure functions, no React).
 * Orders are matched against the live book streamed from the server:
 *   - market orders walk the book (realistic slippage), taker fee
 *   - limit orders that cross fill immediately as taker; the rest rests (GTC)
 *     and fills at its limit price when the touch trades through it, maker fee
 * MAKO-USD is spot (USD + MAKO balances). HYPE-PERP is an isolated-margin perp.
 */

export type Side = "buy" | "sell";
export type OrderType = "market" | "limit";

export interface PaperOrder {
  id: string;
  market: MarketSymbol;
  side: Side;
  type: OrderType;
  px: number;          // limit price (market orders: avg fill)
  sz: number;          // original size
  filled: number;
  lev: number;
  reduceOnly: boolean;
  t: number;
  status: "open" | "filled" | "cancelled" | "rejected";
  avgPx: number;
  reason?: string;
}
export interface PaperFill {
  id: string; orderId: string; market: MarketSymbol; side: Side; px: number; sz: number;
  fee: number; realized: number; liquidity: "maker" | "taker" | "liquidation"; t: number;
}
export interface PerpPos { market: MarketSymbol; size: number; entry: number; margin: number }
export interface Account {
  v: 1;
  usd: number;
  mako: number;
  makoCost: number;   // average cost per MAKO (USD)
  perps: Partial<Record<MarketSymbol, PerpPos>>;
  open: PaperOrder[];
  history: PaperOrder[];
  fills: PaperFill[];
  realized: number;
  fees: number;
  createdAt: number;
}

export const START_USD = 10_000;
const LIQ_FRACTION = 0.9; // liquidated once losses eat 90% of isolated margin
const EPS = 1e-9;

export const newAccount = (): Account => ({ v: 1, usd: START_USD, mako: 0, makoCost: 0, perps: {}, open: [], history: [], fills: [], realized: 0, fees: 0, createdAt: Date.now() });

let seq = 0;
const uid = () => Date.now().toString(36) + (seq++).toString(36) + Math.random().toString(36).slice(2, 6);

export const roundTo = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d;

/* ---------- derived numbers ---------- */
export function upnl(p: PerpPos, mark: number) { return (mark - p.entry) * p.size; }
export function liqPrice(p: PerpPos) { return p.entry - Math.sign(p.size) * (LIQ_FRACTION * p.margin) / Math.abs(p.size); }

export function reservedUsd(a: Account) {
  let r = 0;
  for (const o of a.open) {
    const rem = o.sz - o.filled;
    const spec = MARKETS[o.market];
    if (spec.kind === "spot") { if (o.side === "buy") r += rem * o.px * (1 + spec.makerFee); }
    else if (!o.reduceOnly) r += (rem * o.px) / o.lev;
  }
  return r;
}
export const reservedMako = (a: Account) => a.open.filter(o => o.market === "MAKO-USD" && o.side === "sell").reduce((s, o) => s + o.sz - o.filled, 0);
export const marginUsed = (a: Account) => Object.values(a.perps).reduce((s, p) => s + (p?.margin ?? 0), 0);
export const availableUsd = (a: Account) => Math.max(0, a.usd - marginUsed(a) - reservedUsd(a));

export function equity(a: Account, marks: Partial<Record<MarketSymbol, number>>) {
  let e = a.usd;
  for (const p of Object.values(a.perps)) if (p) e += upnl(p, marks[p.market] ?? p.entry);
  e += a.mako * (marks["MAKO-USD"] ?? a.makoCost);
  return e;
}

/** Walk one side of the book. Returns filled size and average price (respecting an optional limit). */
export function walkBook(levels: BookLevel[], sz: number, limit?: number, side: Side = "buy") {
  let left = sz, cost = 0;
  for (const l of levels) {
    if (limit !== undefined && (side === "buy" ? l.px > limit + EPS : l.px < limit - EPS)) break;
    const take = Math.min(left, l.sz);
    cost += take * l.px; left -= take;
    if (left <= EPS) break;
  }
  const filled = sz - Math.max(0, left);
  return { filled, avgPx: filled > 0 ? cost / filled : 0 };
}

/* ---------- fills ---------- */
type FillResult = { a: Account; fill: PaperFill } | { error: string };

function applyFill(a0: Account, o: PaperOrder, px: number, sz: number, liquidity: PaperFill["liquidity"]): FillResult {
  const spec = MARKETS[o.market];
  const feeRate = liquidity === "maker" ? spec.makerFee : liquidity === "taker" ? spec.takerFee : 0;
  const notional = px * sz;
  const fee = notional * feeRate;
  const a: Account = { ...a0, perps: { ...a0.perps } };
  let realized = 0;

  if (spec.kind === "spot") {
    if (o.side === "buy") {
      // resting buys had funds reserved; immediate buys must fit available
      const need = notional + fee;
      // a resting order's own reservation is still counted in availableUsd: add it back
      const avail = availableUsd(a) + (o.status === "open" && o.type === "limit" ? (o.sz - o.filled) * o.px * (1 + spec.makerFee) : 0);
      if (need > avail + EPS) return { error: "Insufficient USD balance" };
      a.makoCost = (a.makoCost * a.mako + notional) / (a.mako + sz);
      a.mako += sz;
      a.usd -= need;
    } else {
      if (sz > a.mako + EPS) return { error: "Insufficient MAKO balance" };
      realized = (px - a.makoCost) * sz;
      a.mako = Math.max(0, a.mako - sz);
      if (a.mako < EPS) { a.mako = 0; a.makoCost = 0; }
      a.usd += notional - fee;
    }
  } else {
    const cur = a.perps[o.market];
    const dir = o.side === "buy" ? 1 : -1;
    let qty = sz;
    let pos: PerpPos | undefined = cur ? { ...cur } : undefined;
    // reduce first
    if (pos && Math.sign(pos.size) === -dir) {
      const close = Math.min(qty, Math.abs(pos.size));
      realized = (px - pos.entry) * close * Math.sign(pos.size);
      const frac = close / Math.abs(pos.size);
      pos.margin -= pos.margin * frac;
      pos.size += dir * close;
      qty -= close;
      if (Math.abs(pos.size) < EPS) pos = undefined;
    }
    if (o.reduceOnly) qty = 0;
    // reflect the reduced leg before checking margin for any new exposure (flips)
    if (pos) a.perps[o.market] = pos; else delete a.perps[o.market];
    if (qty > EPS) {
      const addMargin = (qty * px) / o.lev;
      const avail = availableUsd(a) + (o.status === "open" && o.type === "limit" && !o.reduceOnly ? ((o.sz - o.filled) * o.px) / o.lev : 0);
      if (addMargin + fee > avail + realized + EPS) return { error: "Insufficient margin" };
      if (pos) {
        const newSize = pos.size + dir * qty;
        pos.entry = (pos.entry * Math.abs(pos.size) + px * qty) / Math.abs(newSize);
        pos.size = newSize;
        pos.margin += addMargin;
      } else {
        pos = { market: o.market, size: dir * qty, entry: px, margin: addMargin };
      }
    }
    if (pos) a.perps[o.market] = pos; else delete a.perps[o.market];
    a.usd += realized - fee;
  }

  a.realized += realized;
  a.fees += fee;
  const fill: PaperFill = { id: uid(), orderId: o.id, market: o.market, side: o.side, px, sz, fee, realized, liquidity, t: Date.now() };
  a.fills = [fill, ...a.fills].slice(0, 200);
  return { a, fill };
}

const pushHistory = (a: Account, o: PaperOrder) => ({ ...a, history: [o, ...a.history].slice(0, 150) });

/* ---------- placing orders ---------- */
export interface OrderInput { market: MarketSymbol; side: Side; type: OrderType; sz: number; px?: number; lev: number; reduceOnly: boolean }
export type PlaceResult = { ok: true; a: Account; order: PaperOrder; fills: PaperFill[] } | { ok: false; error: string };

export function validate(a: Account, i: OrderInput, m: MarketState): string | null {
  const spec = MARKETS[i.market];
  if (!(i.sz > 0) || !Number.isFinite(i.sz)) return "Enter a size";
  if (i.sz < spec.minSize - EPS && !i.reduceOnly) return `Minimum size is ${spec.minSize} ${spec.base}`;
  if (i.type === "limit" && (!i.px || !(i.px > 0))) return "Enter a limit price";
  if (i.type === "limit" && i.px) {
    // fat-finger guard: limit price within 50% of mid
    if (Math.abs(i.px - m.mid) / m.mid > 0.5) return "Limit price is more than 50% away from the market";
  }
  if (spec.kind === "perp") {
    if (i.lev < 1 || i.lev > spec.maxLeverage) return `Leverage must be 1-${spec.maxLeverage}x`;
    const pos = a.perps[i.market];
    if (i.reduceOnly && (!pos || Math.sign(pos.size) === (i.side === "buy" ? 1 : -1))) return "Reduce-only: no position to reduce";
  } else {
    if (i.side === "sell" && i.sz > a.mako - reservedMako(a) + EPS) return "Insufficient MAKO balance";
    const px = i.type === "limit" ? i.px! : (i.side === "buy" ? m.book.asks[0]?.px : m.book.bids[0]?.px) ?? m.mid;
    if (i.side === "buy" && i.sz * px * (1 + spec.takerFee) > availableUsd(a) + EPS) return "Insufficient USD balance";
  }
  return null;
}

export function place(a0: Account, i: OrderInput, m: MarketState): PlaceResult {
  const err = validate(a0, i, m);
  if (err) return { ok: false, error: err };
  const spec = MARKETS[i.market];
  const order: PaperOrder = {
    id: uid(), market: i.market, side: i.side, type: i.type, px: i.px ?? 0, sz: roundTo(i.sz, spec.szDecimals || 4),
    filled: 0, lev: spec.kind === "perp" ? i.lev : 1, reduceOnly: spec.kind === "perp" && i.reduceOnly, t: Date.now(), status: "open", avgPx: 0,
  };

  // reduce-only orders are capped at the position size
  if (order.reduceOnly) {
    const pos = a0.perps[i.market];
    order.sz = Math.min(order.sz, Math.abs(pos?.size ?? 0));
  }

  const levels = i.side === "buy" ? m.book.asks : m.book.bids;
  const { filled, avgPx } = walkBook(levels, order.sz, i.type === "limit" ? i.px : undefined, i.side);
  let a = a0;
  const fills: PaperFill[] = [];

  if (filled > EPS) {
    const r = applyFill(a, { ...order, status: "filled", type: "market" }, avgPx, filled, "taker");
    if ("error" in r) return { ok: false, error: r.error };
    a = r.a; fills.push(r.fill);
    order.filled = filled; order.avgPx = avgPx;
  }

  if (i.type === "market") {
    if (filled < EPS) return { ok: false, error: "No liquidity on the book" };
    order.px = avgPx;
    order.status = "filled";
    if (filled < order.sz - EPS) { order.reason = "Partially filled: book depth exhausted"; order.sz = filled; }
    return { ok: true, a: pushHistory(a, order), order, fills };
  }

  if (order.filled >= order.sz - EPS) {
    order.status = "filled";
    return { ok: true, a: pushHistory(a, order), order, fills };
  }
  if (spec.kind === "perp" && !order.reduceOnly && ((order.sz - order.filled) * order.px) / order.lev > availableUsd(a) + EPS) {
    if (!fills.length) return { ok: false, error: "Insufficient margin" };
    order.status = "filled"; order.sz = order.filled; order.reason = "Remainder cancelled: insufficient margin";
    return { ok: true, a: pushHistory(a, order), order, fills };
  }
  return { ok: true, a: { ...a, open: [order, ...a.open] }, order, fills };
}

export function cancel(a: Account, id: string): Account {
  const o = a.open.find(x => x.id === id);
  if (!o) return a;
  return pushHistory({ ...a, open: a.open.filter(x => x.id !== id) }, { ...o, status: "cancelled" });
}

export function cancelAll(a: Account, market?: MarketSymbol): Account {
  let n = a;
  for (const o of a.open) if (!market || o.market === market) n = cancel(n, o.id);
  return n;
}

/* ---------- per-frame matching & liquidation ---------- */
export interface TickEvent { kind: "fill" | "liq" | "reject"; text: string }

export function tick(a0: Account, markets: MarketState[]): { a: Account; events: TickEvent[] } {
  let a = a0;
  const events: TickEvent[] = [];
  const bySym = Object.fromEntries(markets.map(m => [m.symbol, m])) as Record<MarketSymbol, MarketState>;

  for (const o of a0.open) {
    const m = bySym[o.market];
    if (!m) continue;
    const bestAsk = m.book.asks[0]?.px, bestBid = m.book.bids[0]?.px;
    const hit = o.side === "buy" ? bestAsk !== undefined && bestAsk <= o.px + EPS : bestBid !== undefined && bestBid >= o.px - EPS;
    if (!hit) continue;
    const rem = o.sz - o.filled;
    let order = { ...o };
    if (order.reduceOnly) {
      const pos = a.perps[o.market];
      const cap = pos && Math.sign(pos.size) !== (o.side === "buy" ? 1 : -1) ? Math.abs(pos.size) : 0;
      if (cap < EPS) {
        a = pushHistory({ ...a, open: a.open.filter(x => x.id !== o.id) }, { ...order, status: "cancelled", reason: "Position already closed" });
        continue;
      }
      order = { ...order, sz: order.filled + Math.min(rem, cap) };
    }
    const qty = order.sz - order.filled;
    const r = applyFill(a, order, o.px, qty, "maker");
    a = { ...a, open: a.open.filter(x => x.id !== o.id) };
    if ("error" in r) {
      a = pushHistory(a, { ...order, status: "rejected", reason: r.error });
      events.push({ kind: "reject", text: `${o.market} ${o.side} limit rejected: ${r.error}` });
      continue;
    }
    a = { ...r.a, open: r.a.open.filter(x => x.id !== o.id) };
    const done: PaperOrder = { ...order, filled: order.sz, avgPx: order.filled ? (order.avgPx * order.filled + o.px * qty) / order.sz : o.px, status: "filled" };
    a = pushHistory(a, done);
    events.push({ kind: "fill", text: `Filled ${o.side} ${fmtSz(qty, o.market)} ${MARKETS[o.market].base} @ ${o.px.toFixed(MARKETS[o.market].pxDecimals)}` });
  }

  for (const p of Object.values(a.perps)) {
    if (!p) continue;
    const mark = bySym[p.market]?.mid;
    if (mark === undefined) continue;
    if (upnl(p, mark) <= -LIQ_FRACTION * p.margin) {
      const loss = upnl(p, mark);
      const perps = { ...a.perps };
      delete perps[p.market];
      const fill: PaperFill = { id: uid(), orderId: "liquidation", market: p.market, side: p.size > 0 ? "sell" : "buy", px: mark, sz: Math.abs(p.size), fee: 0, realized: loss, liquidity: "liquidation", t: Date.now() };
      // cancel reduce-only orders for the closed position
      a = { ...a, perps, usd: a.usd + loss, realized: a.realized + loss, fills: [fill, ...a.fills].slice(0, 200), open: a.open.filter(o => !(o.market === p.market && o.reduceOnly)) };
      events.push({ kind: "liq", text: `${p.market} position liquidated at ${mark.toFixed(MARKETS[p.market].pxDecimals)}` });
    }
  }
  return { a, events };
}

export const fmtSz = (v: number, market: MarketSymbol) => {
  const d = MARKETS[market].szDecimals;
  return v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
};

/* ---------- persistence ---------- */
const KEY = (owner: string) => `mako.paper.v1:${owner}`;

export function loadAccount(owner: string): Account {
  try {
    const raw = localStorage.getItem(KEY(owner));
    if (raw) {
      const a = JSON.parse(raw) as Account;
      if (a && a.v === 1 && Number.isFinite(a.usd)) return { ...newAccount(), ...a };
    }
  } catch { /* storage blocked or corrupt */ }
  return newAccount();
}

export function saveAccount(owner: string, a: Account) {
  try { localStorage.setItem(KEY(owner), JSON.stringify(a)); } catch { /* storage blocked */ }
}
