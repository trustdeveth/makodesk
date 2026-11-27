import "server-only";
import type { Candle, DeskState, MarketSymbol } from "../types";
import type { Timeframe } from "../markets";
import { engine } from "./engine";

/**
 * Single entry point for desk data.
 *
 * Today: the preview engine (simulated, always reported as mode "preview" so the
 * UI labels it). When MakoDesk is deployed, implement a live reader here
 * (MakoDesk.state() + Filled/Burned/MoodChanged events) and return mode "live".
 * Every API route and the SSE stream read through these two functions, so the
 * switch happens in one place.
 */
export function getDeskState(): DeskState {
  return engine.snapshot();
}

export function subscribeDesk(fn: (s: DeskState) => void) {
  return engine.subscribe(fn);
}

export function getCandles(market: MarketSymbol, tf: Timeframe, limit: number): Candle[] {
  return engine.candles(market, tf, limit);
}
