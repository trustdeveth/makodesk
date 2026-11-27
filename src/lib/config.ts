import "server-only";
import type { PublicConfig } from "./types";

const env = (k: string, d = "") => (process.env[k] ?? d).trim();
const isAddr = (a: string) => /^0x[0-9a-fA-F]{40}$/.test(a);

/** Runtime config, read on the server from process.env. Safe to send to the browser. */
export function getConfig(): PublicConfig {
  const token = env("MAKO_TOKEN_ADDRESS");
  const desk = env("MAKO_DESK_ADDRESS");
  const lp = env("MAKO_LP_ADDRESS");
  return {
    siteUrl: env("SITE_URL", "https://makodesk.xyz"),
    previewMode: env("MAKO_PREVIEW_MODE", "true") !== "false",
    brand: {
      project: "Mako Desk",
      token: "Mako",
      ticker: "MAKO",
      tagline: "The memecoin that makes markets.",
      domain: "makodesk.xyz",
      x: "makodeskapp",
      xUrl: env("MAKO_X_URL", "https://x.com/makodeskapp"),
      telegramUrl: env("MAKO_TELEGRAM_URL", "https://t.me/makodesk"),
    },
    chain: {
      chainId: Number(env("ELYSIUM_CHAIN_ID", "99901")) || 99901,
      name: "Elysium",
      rpcUrl: env("ELYSIUM_RPC_URL", "https://rpc.elysium.kinetiq.xyz"),
      explorer: env("ELYSIUM_EXPLORER_URL", "https://elysium.kinetiq.xyz/explorer").replace(/\/$/, ""),
      nativeCurrency: { name: "HYPE", symbol: "HYPE", decimals: 18 },
    },
    contracts: {
      token: isAddr(token) ? token : "",
      desk: isAddr(desk) ? desk : "",
      lp: isAddr(lp) ? lp : "",
    },
    links: {
      swap: env("MAKO_SWAP_URL"),
      bridge: env("MAKO_BRIDGE_URL"),
      chart: env("MAKO_CHART_URL"),
    },
    tokenomics: {
      supply: 1_000_000_000,
      split: [
        { label: "Fair-launch liquidity", pct: 70, note: "Paired with HYPE, LP locked" },
        { label: "Desk treasury", pct: 20, note: "Held by the MakoDesk contract" },
        { label: "Community & ecosystem", pct: 10, note: "12-month linear unlock" },
      ],
      team: 0,
      tax: 0,
      burnShare: 80,
    },
  };
}
