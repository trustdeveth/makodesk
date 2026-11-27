export type MoodKey = "feeding" | "hunting" | "cruising" | "circling" | "breach";

export interface Mood {
  key: MoodKey;
  label: string;
  desc: string;
  color: string;
}

export interface BookLevel { px: number; sz: number; cum: number; desk: boolean }
export interface Fill { t: number; market: string; side: "buy" | "sell"; px: number; sz: number; edge: number }
export interface Burn { t: number; amount: number; reason: "Desk profit" | "Wick bonus"; tx: string }
export interface Trade { t: number; px: number; sz: number; side: "buy" | "sell" }

export interface DeskState {
  mode: "preview" | "live";
  t: number;
  mid: number;
  midOpen: number;
  funding: number;
  makoPrice: number;
  makoChange: number;
  supply: number;
  burned: number;
  holders: number;
  treasury: { hype: number; mako: number; usd: number };
  pnl: { total: number; session: number; history: number[] };
  fills: Fill[];
  burns: Burn[];
  trades: Trade[];
  book: { bids: BookLevel[]; asks: BookLevel[]; spread: number };
  mood: Mood;
  latency: number;
  coreBlock: number;
  elyBlock: number;
  risk: { positionPct: number; lossPct: number; skewPct: number; paused: boolean };
}

export interface PublicConfig {
  siteUrl: string;
  previewMode: boolean;
  brand: { project: string; token: string; ticker: string; tagline: string; domain: string; x: string; xUrl: string; telegramUrl: string };
  chain: { chainId: number; name: string; rpcUrl: string; explorer: string; nativeCurrency: { name: string; symbol: string; decimals: number } };
  contracts: { token: string; desk: string; lp: string };
  links: { swap: string; bridge: string; chart: string };
  tokenomics: { supply: number; split: { label: string; pct: number; note: string }[]; team: number; tax: number; burnShare: number };
}
