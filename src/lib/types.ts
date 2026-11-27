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
  markets: MarketState[];
  /** where each part of the state comes from */
  sources: { market: "hyperliquid" | "preview"; desk: "chain" | "preview" };
  /** what is genuinely live right now; the UI shows "goes live at launch" states for the rest */
  live: { market: boolean; desk: boolean; token: boolean };
  /** off-chain wick detector (mirrors the on-chain one in MakoDesk) */
  wick: { armed: boolean; at: number | null; dropPct: number };
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

/* ---------- Markets / terminal ---------- */
export type MarketSymbol = "HYPE-PERP" | "MAKO-USD";
export interface Candle { t: number; o: number; h: number; l: number; c: number; v: number }
export interface MarketState {
  symbol: MarketSymbol;
  mid: number;
  open24h: number;
  high24h: number;
  low24h: number;
  vol24h: number;      // base units
  change24h: number;   // percent
  book: { bids: BookLevel[]; asks: BookLevel[]; spread: number };
  trades: Trade[];
  bar: Candle;         // current 1m candle
}

/* ---------- Chat ---------- */
export type ChatRoomId = "general" | "trading" | "alpha" | "support";
export interface ChatAuthor { id: string; name: string; kind: "wallet" | "guest"; admin?: boolean }
export interface ChatMessage {
  id: string;
  room: ChatRoomId;
  t: number;
  author: ChatAuthor;
  text: string;
  replyTo?: { id: string; name: string; text: string };
}
export interface ChatRoomInfo { id: ChatRoomId; name: string; topic: string; slowModeSec: number; pinned: ChatMessage | null }
export interface ChatSession { address: string | null; guestName: string | null; authorId: string | null; name: string | null; admin: boolean; allowGuests: boolean }
