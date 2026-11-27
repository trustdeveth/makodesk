import "server-only";
import type { Candle, DeskState, MarketSymbol } from "../types";
import type { Timeframe } from "../markets";
import { MOODS } from "../moods";
import { engine } from "./engine";
import { hyperliquid } from "./hyperliquid";
import { deskChain } from "./deskChain";
import { getConfig } from "../config";

/**
 * Single entry point for desk data. Each part switches to live data independently:
 *   - market (HYPE-PERP book, trades, funding, mood, wick): Hyperliquid feed (Phase 2),
 *     falling back to the preview engine if the feed is down or MARKET_DATA=preview.
 *   - desk (fills, PnL, burns, mood, risk): the deployed MakoDesk contract once
 *     MAKO_DESK_ADDRESS is set and readable (Phase 3); preview engine otherwise.
 * `mode` is "live" only when the desk itself is read from chain.
 */

function withChain(base: DeskState): DeskState {
  deskChain.start();
  const c = deskChain.state;
  if (!deskChain.ready() || !c) return base;
  const m = MOODS.find(x => x.key === c.mood) ?? MOODS[2];
  const maxPos = Number(deskChain.maxPositionSzE8) / 1e8 || 1;
  const pos = Number(c.positionE8) / 1e8;
  const realized = Number(c.realizedE6) / 1e6;
  return {
    ...base,
    mode: "live",
    sources: { ...base.sources, desk: "chain" },
    mood: { key: m.key, label: m.label, desc: m.desc, color: m.color },
    funding: Number(c.fundingE8) / 1e10, // E8 where 1e8 = 1%  ->  fraction
    burned: Number(c.totalBurned) / 1e18,
    fills: deskChain.fills,
    burns: deskChain.burns,
    pnl: { total: realized, session: realized - (deskChain.pnlHistory[0] ?? realized), history: deskChain.pnlHistory.length > 1 ? deskChain.pnlHistory : [realized, realized] },
    risk: {
      positionPct: Math.min(100, (Math.abs(pos) / maxPos) * 100),
      lossPct: 0,
      skewPct: Math.max(0, Math.min(100, 50 + (pos / maxPos) * 50)),
      paused: c.paused,
    },
  };
}

/**
 * Live-only view: anything that is not backed by a real source is cleared, so the app and API
 * never present simulated desk or token figures as real. Contract-backed parts fill in
 * automatically once MAKO_TOKEN_ADDRESS / MAKO_LP_ADDRESS / MAKO_DESK_ADDRESS are deployed.
 */
function liveOnly(s: DeskState): DeskState {
  const cfg = getConfig();
  const live = {
    market: s.sources.market === "hyperliquid",
    desk: s.sources.desk === "chain",
    token: !!cfg.contracts.token && deskChain.makoPriceHype !== null,
  };
  let out: DeskState = { ...s, live, latency: 0, coreBlock: 0, elyBlock: 0, holders: 0 };
  if (!live.desk) {
    out = {
      ...out,
      fills: [], burns: live.token ? out.burns : [],
      pnl: { total: 0, session: 0, history: [] },
      treasury: { hype: 0, mako: 0, usd: 0 },
      risk: { positionPct: 0, lossPct: 0, skewPct: 50, paused: false },
      book: { ...out.book, bids: out.book.bids.map(l => ({ ...l, desk: false })), asks: out.book.asks.map(l => ({ ...l, desk: false })) },
      markets: out.markets.map(m => ({ ...m, book: { ...m.book, bids: m.book.bids.map(l => ({ ...l, desk: false })), asks: m.book.asks.map(l => ({ ...l, desk: false })) } })),
    };
  }
  if (!live.token) {
    out = { ...out, makoPrice: 0, makoChange: 0, burned: 0, burns: [], markets: out.markets.filter(m => m.symbol !== "MAKO-USD") };
  }
  return out;
}

export function getDeskState(): DeskState {
  return liveOnly(withChain(engine.snapshot()));
}

export function subscribeDesk(fn: (s: DeskState) => void) {
  return engine.subscribe(s => fn(liveOnly(withChain(s))));
}

/** Candles: real Hyperliquid history for HYPE-PERP when the live feed is enabled, else the engine. */
export async function getCandles(market: MarketSymbol, tf: Timeframe, limit: number): Promise<{ candles: Candle[]; source: "hyperliquid" | "preview" }> {
  if (market === "HYPE-PERP" && hyperliquid.enabled()) {
    try {
      const candles = await hyperliquid.candles(tf, limit);
      if (candles.length) return { candles, source: "hyperliquid" };
    } catch { /* fall back to the engine */ }
  }
  return { candles: engine.candles(market, tf, limit), source: "preview" };
}

export function sourceStatus() {
  return { market: hyperliquid.status(), desk: deskChain.status() };
}
