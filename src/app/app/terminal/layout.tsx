import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terminal",
  description: "Trade HYPE-PERP and MAKO-USD on a pro terminal: live candles, order book, tape, limit and market orders, positions and chat.",
};

export default function TerminalLayout({ children }: { children: React.ReactNode }) {
  return children;
}
