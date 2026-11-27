export const fmt = {
  usd(n: number, d = 2) {
    return "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  },
  num(n: number, d = 0) {
    return Number(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  },
  compact(n: number) {
    return Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(n);
  },
  pct(n: number, d = 2) {
    return (n >= 0 ? "+" : "") + n.toFixed(d) + "%";
  },
  short(a?: string | null) {
    return a ? a.slice(0, 6) + "…" + a.slice(-4) : "";
  },
  time(t: number) {
    return new Date(t).toLocaleTimeString("en-US", { hour12: false });
  },
  ago(t: number) {
    const s = Math.max(1, Math.round((Date.now() - t) / 1000));
    return s < 60 ? s + "s ago" : s < 3600 ? Math.round(s / 60) + "m ago" : Math.round(s / 3600) + "h ago";
  },
};

export const MOOD_META = {
  feeding: { pos: 6, spread: "1.5 bps", burn: "1.5x", range: "< -0.40%" },
  hunting: { pos: 28, spread: "2 bps", burn: "1.2x", range: "-0.40% to 0" },
  cruising: { pos: 50, spread: "3 bps", burn: "1.0x", range: "0 to 0.60%" },
  circling: { pos: 72, spread: "6 bps", burn: "0.8x", range: "0.60% to 1.20%" },
  breach: { pos: 94, spread: "12 bps", burn: "2.0x bonus", range: "> 1.20%" },
} as const;
