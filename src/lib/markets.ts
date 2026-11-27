import type { MarketSymbol } from "./types";

export interface MarketSpec {
  symbol: MarketSymbol;
  base: string;
  quote: string;
  kind: "perp" | "spot";
  tick: number;
  pxDecimals: number;
  szDecimals: number;
  minSize: number;
  maxLeverage: number;
  takerFee: number; // fraction
  makerFee: number;
  /** Book grouping options, in price units. */
  groups: number[];
}

export const MARKETS: Record<MarketSymbol, MarketSpec> = {
  "HYPE-PERP": {
    symbol: "HYPE-PERP", base: "HYPE", quote: "USD", kind: "perp",
    tick: 0.001, pxDecimals: 3, szDecimals: 2, minSize: 0.1, maxLeverage: 20,
    takerFee: 0.00045, makerFee: 0.00015, groups: [0.001, 0.01, 0.05, 0.1],
  },
  "MAKO-USD": {
    symbol: "MAKO-USD", base: "MAKO", quote: "USD", kind: "spot",
    tick: 0.000001, pxDecimals: 6, szDecimals: 0, minSize: 1000, maxLeverage: 1,
    takerFee: 0.001, makerFee: 0, groups: [0.000001, 0.000005, 0.00001, 0.00005],
  },
};

export const MARKET_LIST = Object.values(MARKETS);
export const isMarket = (s: string | null | undefined): s is MarketSymbol => !!s && s in MARKETS;

export const TIMEFRAMES = { "1m": 60_000, "5m": 300_000, "15m": 900_000, "1h": 3_600_000, "4h": 14_400_000, "1D": 86_400_000 } as const;
export type Timeframe = keyof typeof TIMEFRAMES;
export const isTimeframe = (s: string | null | undefined): s is Timeframe => !!s && s in TIMEFRAMES;

export const CHAT_ROOMS = [
  { id: "general", name: "general", topic: "Everything $MAKO" },
  { id: "trading", name: "trading", topic: "Charts, entries, the book" },
  { id: "alpha", name: "alpha", topic: "Elysium & HyperCore ecosystem" },
  { id: "support", name: "support", topic: "Wallets, bridging, help. Team will never DM you first." },
] as const;
export const CHAT_MAX_LEN = 500;
