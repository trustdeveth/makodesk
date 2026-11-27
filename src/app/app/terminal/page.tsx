"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLive } from "@/components/providers/LiveProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { CandleChart, type PriceLine } from "@/components/terminal/CandleChart";
import { AccountTabs, MarketBar, OrderBook, OrderEntry, TradesTape, type EntryState } from "@/components/terminal/Panels";
import { usePaper } from "@/components/terminal/usePaper";
import { liqPrice } from "@/components/terminal/paper";
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
  const paper = usePaper();
  const [entry, setEntryState] = useState<EntryState>({ side: "buy", type: "market", price: "", size: "", lev: 5, reduceOnly: false });
  const setEntry = useCallback((e: Partial<EntryState>) => setEntryState(p => ({ ...p, ...e })), []);

  // restore prefs (client only)
  useEffect(() => {
    const p = readPrefs();
    if (isMarket(p.market)) setMarket(p.market);
    if (isTimeframe(p.tf)) setTf(p.tf);
    if (typeof p.ma === "boolean") setShowMA(p.ma);
  }, []);

  const { candles, error, m } = useCandles(market, tf);
  const marks = useMemo(() => Object.fromEntries((s?.markets ?? []).map(x => [x.symbol, x.mid])) as Partial<Record<MarketSymbol, number>>, [s]);

  const selectMarket = (sym: MarketSymbol) => {
    setMarket(sym);
    writePrefs({ market: sym });
    setEntryState(p => ({ ...p, price: "", size: "", reduceOnly: false }));
  };

  const lines = useMemo<PriceLine[]>(() => {
    const out: PriceLine[] = [];
    const pos = paper.acc.perps[market];
    if (pos) {
      out.push({ px: pos.entry, color: pos.size > 0 ? "#3ee6a8" : "#ff5252", label: `${pos.size > 0 ? "LONG" : "SHORT"} ${Math.abs(pos.size)}`, dashed: false });
      const lq = liqPrice(pos);
      if (lq > 0) out.push({ px: lq, color: "#ffc247", label: "LIQ" });
    }
    if (market === "MAKO-USD" && paper.acc.mako > 0) out.push({ px: paper.acc.makoCost, color: "#34b7dd", label: "AVG COST", dashed: false });
    for (const o of paper.acc.open) if (o.market === market) out.push({ px: o.px, color: o.side === "buy" ? "#3ee6a8" : "#ff5252", label: `${o.side.toUpperCase()} ${o.sz - o.filled}` });
    return out;
  }, [paper.acc, market]);

  const myPrices = useMemo(() => new Set(paper.acc.open.filter(o => o.market === market).map(o => o.px.toFixed(spec.pxDecimals))), [paper.acc.open, market, spec.pxDecimals]);

  const submit = () => {
    const err = paper.submit({
      market, side: entry.side, type: entry.type, sz: parseFloat(entry.size) || 0,
      px: entry.type === "limit" ? parseFloat(entry.price) || 0 : undefined, lev: entry.lev, reduceOnly: entry.reduceOnly,
    });
    if (err) toast(err, "warn"); else setEntry({ size: "" });
  };

  const closePos = (sym: MarketSymbol, pct: number) => {
    const sp = MARKETS[sym];
    const d = sp.szDecimals;
    if (sp.kind === "spot") {
      const amt = Math.floor(paper.acc.mako * pct * 10 ** d) / 10 ** d;
      const err = paper.submit({ market: sym, side: "sell", type: "market", sz: amt, lev: 1, reduceOnly: false });
      if (err) toast(err, "warn");
      return;
    }
    const pos = paper.acc.perps[sym];
    if (!pos) return;
    const amt = pct >= 1 ? Math.abs(pos.size) : Math.floor(Math.abs(pos.size) * pct * 10 ** d) / 10 ** d;
    const err = paper.submit({ market: sym, side: pos.size > 0 ? "sell" : "buy", type: "market", sz: amt, lev: 1, reduceOnly: true });
    if (err) toast(err, "warn");
  };

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
              ? <OrderBook m={m} spec={spec} myPrices={myPrices} onPick={p => setEntry({ type: "limit", price: p.toFixed(spec.pxDecimals) })} />
              : <TradesTape m={m} spec={spec} />}
          </div>
        </div>

        <div className="panel t-entry-panel">
          <OrderEntry m={m} spec={spec} acc={paper.acc} entry={entry} setEntry={setEntry} onSubmit={submit} onReset={paper.reset} marks={marks} />
        </div>

        <div className="panel t-bottom">
          <div className="t-bottom-switch seg" role="tablist" aria-label="Bottom panel">
            <button role="tab" aria-selected={bottom === "account"} className={bottom === "account" ? "on" : ""} onClick={() => setBottom("account")}>Account</button>
            <button role="tab" aria-selected={bottom === "chat"} className={bottom === "chat" ? "on" : ""} onClick={() => setBottom("chat")}>Chat</button>
          </div>
          <div className={"t-bottom-account" + (bottom === "account" ? " show" : "")}>
            <AccountTabs acc={paper.acc} marks={marks} onCancel={paper.cancel} onCancelAll={() => paper.cancelAll()} onClose={closePos} onSelect={selectMarket} />
          </div>
          <div className={"t-bottom-chat" + (bottom === "chat" ? " show" : "")}>
            <ChatPanel variant="dock" initialRoom="trading" />
          </div>
        </div>
      </div>
    </section>
  );
}
