"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLive } from "@/components/providers/LiveProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { CandleChart, type PriceLine } from "@/components/terminal/CandleChart";
import { MarketBar, OrderBook, TradesTape } from "@/components/terminal/Panels";
import { TradeSoon, AccountSoon } from "@/components/app/TradeSoon";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { MARKETS, TIMEFRAMES, isMarket, isTimeframe, type Timeframe } from "@/lib/markets";
import type { Candle, MarketSymbol } from "@/lib/types";

const PREF_KEY = "mako.terminal.prefs";
const readPrefs = (): { market?: string; tf?: string; ma?: boolean } => {
  try { return JSON.parse(localStorage.getItem(PREF_KEY) || "{}"); } catch { return {}; }
};
const writePrefs = (p: object) => { try { localStorage.setItem(PREF_KEY, JSON.stringify({ ...readPrefs(), ...p })); } catch { /* storage blocked */ } };

/** Load candle history and keep the last candle in sync with the live 1m bar. */
function useCandles(market: MarketSymbol, tf: Timeframe) {
  const s = useLive();
  const [candles, setCandles] = useState<Candle[]>([]);
  const [error, setError] = useState<string | null>(null);
  const prevBar = useRef<Candle | null>(null);

  useEffect(() => {
    const ctl = new AbortController();
    setCandles([]);
    setError(null);
    prevBar.current = null;
    fetch(`/api/candles?market=${market}&tf=${tf}&limit=500`, { signal: ctl.signal, cache: "no-store" })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j: { candles: Candle[] }) => setCandles(j.candles))
      .catch(e => { if ((e as Error).name !== "AbortError") setError("Couldn't load chart history"); });
    return () => ctl.abort();
  }, [market, tf]);

  const m = s?.markets?.find(x => x.symbol === market);
  useEffect(() => {
    if (!m) return;
    const bar = m.bar;
    const prev = prevBar.current;
    const dv = prev && prev.t === bar.t ? bar.v - prev.v : bar.v;
    prevBar.current = bar;
    setCandles(cs => {
      if (!cs.length) return cs;
      const ms = TIMEFRAMES[tf];
      const bucket = Math.floor(bar.t / ms) * ms;
      const last = cs[cs.length - 1];
      if (last.t === bucket) {
        const upd = { ...last, h: Math.max(last.h, m.mid), l: Math.min(last.l, m.mid), c: m.mid, v: last.v + Math.max(0, dv) };
        return [...cs.slice(0, -1), upd];
      }
      if (bucket > last.t) return [...cs.slice(-999), { t: bucket, o: last.c, h: Math.max(last.c, m.mid), l: Math.min(last.c, m.mid), c: m.mid, v: Math.max(0, dv) }];
      return cs;
    });
  }, [m, tf]);

  return { candles, error, m };
}

export default function TerminalPage() {
  const s = useLive();
  const toast = useToast();
  const [market, setMarket] = useState<MarketSymbol>("HYPE-PERP");
  const [tf, setTf] = useState<Timeframe>("5m");
  const [showMA, setShowMA] = useState(true);
  const [side, setSide] = useState<"book" | "trades">("book");
  const [bottom, setBottom] = useState<"account" | "chat">("account");
  const spec = MARKETS[market];

  // restore prefs (client only)
  useEffect(() => {
    const p = readPrefs();
    if (isMarket(p.market)) setMarket(p.market);
    if (isTimeframe(p.tf)) setTf(p.tf);
    if (typeof p.ma === "boolean") setShowMA(p.ma);
  }, []);

  // only markets that are live can be selected (MAKO-USD lists at launch)
  useEffect(() => { if (s && !s.markets.some(x => x.symbol === market)) setMarket("HYPE-PERP"); }, [s, market]);
  const { candles, error, m } = useCandles(market, tf);

  const selectMarket = (sym: MarketSymbol) => {
    setMarket(sym);
    writePrefs({ market: sym });
  };

  const lines = useMemo<PriceLine[]>(() => [], []);
  const myPrices = useMemo(() => new Set<string>(), []);

  return (
    <section className="view active term">
      <MarketBar m={m} spec={spec} s={s} onSelect={selectMarket} />

      <div className="t-grid">
        <div className="panel t-chart">
          <div className="panel-h t-chart-h">
            <div className="seg" role="tablist" aria-label="Timeframe">
              {(Object.keys(TIMEFRAMES) as Timeframe[]).map(k => (
                <button key={k} role="tab" aria-selected={tf === k} className={tf === k ? "on" : ""} onClick={() => { setTf(k); writePrefs({ tf: k }); }}>{k}</button>
              ))}
            </div>
            <div className="r">
              <label className="t-check"><input type="checkbox" checked={showMA} onChange={e => { setShowMA(e.target.checked); writePrefs({ ma: e.target.checked }); }} />MA 20/50</label>
            </div>
          </div>
          <div className="t-chart-b">
            {error ? <div className="empty">{error}</div> : <CandleChart candles={candles} pxDecimals={spec.pxDecimals} tfMs={TIMEFRAMES[tf]} lines={lines} showMA={showMA} />}
          </div>
        </div>

        <div className="panel t-side-panel">
          <div className="panel-h">
            <div className="seg" role="tablist">
              <button role="tab" aria-selected={side === "book"} className={side === "book" ? "on" : ""} onClick={() => setSide("book")}>Order book</button>
              <button role="tab" aria-selected={side === "trades"} className={side === "trades" ? "on" : ""} onClick={() => setSide("trades")}>Trades</button>
            </div>
          </div>
          <div className="t-side-b">
            {side === "book"
              ? <OrderBook rows={20} m={m} spec={spec} myPrices={myPrices} onPick={() => {}} />
              : <TradesTape m={m} spec={spec} />}
          </div>
        </div>

        <div className="panel t-entry-panel">
          <TradeSoon m={m} spec={spec} />
        </div>

        <div className="panel t-bottom">
          <div className="t-bottom-switch seg" role="tablist" aria-label="Bottom panel">
            <button role="tab" aria-selected={bottom === "account"} className={bottom === "account" ? "on" : ""} onClick={() => setBottom("account")}>Account</button>
            <button role="tab" aria-selected={bottom === "chat"} className={bottom === "chat" ? "on" : ""} onClick={() => setBottom("chat")}>Chat</button>
          </div>
          <div className={"t-bottom-account" + (bottom === "account" ? " show" : "")}>
            <AccountSoon />
          </div>
          <div className={"t-bottom-chat" + (bottom === "chat" ? " show" : "")}>
            <ChatPanel variant="dock" initialRoom="trading" />
          </div>
        </div>
      </div>
    </section>
  );
}
