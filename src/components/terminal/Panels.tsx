"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { RotateCcw, X } from "lucide-react";
import { MARKETS, MARKET_LIST, type MarketSpec } from "@/lib/markets";
import type { BookLevel, DeskState, MarketState, MarketSymbol } from "@/lib/types";
import { fmt } from "@/lib/format";
import {
  type Account, type OrderType, type Side, availableUsd, equity, fmtSz, liqPrice, marginUsed, reservedMako, roundTo, upnl, walkBook, START_USD,
} from "./paper";

const px = (v: number, spec: MarketSpec) => v.toFixed(spec.pxDecimals);
const usd = (v: number, d = 2) => (v < 0 ? "-" : "") + "$" + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const signed = (v: number, d = 2) => (v >= 0 ? "+" : "-") + "$" + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const cls = (v: number) => (v > 0 ? "up" : v < 0 ? "down" : "");

/* ---------------- market bar ---------------- */
export function MarketBar({ m, spec, s, onSelect }: { m: MarketState | undefined; spec: MarketSpec; s: DeskState | null; onSelect(sym: MarketSymbol): void }) {
  return (
    <div className="t-bar">
      <div className="t-mkts" role="tablist" aria-label="Markets">
        {MARKET_LIST.filter(sp => sp.symbol === spec.symbol || s?.markets.some(x => x.symbol === sp.symbol)).map(sp => {
          const mm = s?.markets.find(x => x.symbol === sp.symbol);
          return (
            <button key={sp.symbol} role="tab" aria-selected={sp.symbol === spec.symbol} className={sp.symbol === spec.symbol ? "on" : ""} onClick={() => onSelect(sp.symbol)}>
              <b>{sp.symbol}</b>
              <span className="tag">{sp.kind === "perp" ? `${sp.maxLeverage}x` : "spot"}</span>
              {mm && <span className={"mono " + cls(mm.change24h)}>{fmt.pct(mm.change24h)}</span>}
            </button>
          );
        })}
      </div>
      <div className="t-stats">
        <div className="t-last"><b className={"mono " + cls(m ? m.mid - m.bar.o : 0)}>{m ? px(m.mid, spec) : "—"}</b><small>{spec.quote}</small>{s?.live?.market && spec.symbol === "HYPE-PERP" && <span className="pill mint live t-src" title="Real Hyperliquid data"><span className="dot" />LIVE</span>}</div>
        <div><small>24h change</small><b className={"mono " + cls(m?.change24h ?? 0)}>{m ? fmt.pct(m.change24h) : "—"}</b></div>
        <div><small>24h high</small><b className="mono">{m ? px(m.high24h, spec) : "—"}</b></div>
        <div><small>24h low</small><b className="mono">{m ? px(m.low24h, spec) : "—"}</b></div>
        <div className="hide-sm"><small>24h volume</small><b className="mono">{m ? fmt.compact(m.vol24h) + " " + spec.base : "—"}</b></div>
        <div className="hide-sm"><small>24h turnover</small><b className="mono">{m ? "$" + fmt.compact(m.vol24h * m.mid) : "—"}</b></div>
        {spec.kind === "perp" && <div className="hide-sm"><small>Funding (1h)</small><b className={"mono " + cls(-(s?.funding ?? 0))}>{s ? (s.funding * 100).toFixed(4) + "%" : "—"}</b></div>}
        {spec.kind === "perp" && <div className="hide-sm"><small>Mood</small><b style={{ color: s?.mood.color }}>{s?.mood.label ?? "—"}</b></div>}
      </div>
    </div>
  );
}

/* ---------------- order book ---------------- */
function group(levels: BookLevel[], step: number, side: "bid" | "ask", d: number): BookLevel[] {
  const out: BookLevel[] = [];
  for (const l of levels) {
    const k = side === "bid" ? Math.floor(l.px / step + 1e-9) * step : Math.ceil(l.px / step - 1e-9) * step;
    const p = +k.toFixed(d);
    const last = out[out.length - 1];
    if (last && last.px === p) { last.sz += l.sz; last.desk = last.desk || l.desk; }
    else out.push({ px: p, sz: l.sz, cum: 0, desk: l.desk });
  }
  let c = 0;
  for (const l of out) { c += l.sz; l.cum = c; }
  return out;
}

export function OrderBook({ m, spec, myPrices, onPick, rows = 11 }: { m: MarketState | undefined; spec: MarketSpec; myPrices: Set<string>; onPick(px: number, side: Side): void; rows?: number }) {
  const [g, setG] = useState(0);
  const step = spec.groups[g] ?? spec.tick;
  const d = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
  const { asks, bids, max, bidShare } = useMemo(() => {
    if (!m) return { asks: [], bids: [], max: 1, bidShare: 50 };
    const a = group(m.book.asks, step, "ask", d).slice(0, rows);
    const b = group(m.book.bids, step, "bid", d).slice(0, rows);
    const max = Math.max(a[a.length - 1]?.cum ?? 1, b[b.length - 1]?.cum ?? 1);
    const tb = b.reduce((s, l) => s + l.sz, 0), ta = a.reduce((s, l) => s + l.sz, 0);
    return { asks: a.reverse(), bids: b, max, bidShare: tb + ta ? (tb / (tb + ta)) * 100 : 50 };
  }, [m, step, d, rows]);

  const row = (l: BookLevel, side: "bid" | "ask") => (
    <button key={side + l.px} className={`lv ${side}`} onClick={() => onPick(l.px, side === "ask" ? "buy" : "sell")} title="Click to use this price">
      <i style={{ width: ((l.cum / max) * 100).toFixed(1) + "%" }} />
      <span className="px">{myPrices.has(l.px.toFixed(d)) && <em className="mine" aria-label="Your order" />}{l.px.toFixed(d)}</span>
      <span>{spec.szDecimals ? l.sz.toFixed(0) : fmt.compact(l.sz)}</span>
      <span>{fmt.compact(l.cum)}</span>
    </button>
  );

  return (
    <div className="t-book">
      <div className="t-book-h">
        <span>Price</span><span>Size ({spec.base})</span><span>Total</span>
      </div>
      <div className="t-book-side asks">{asks.map(l => row(l, "ask"))}</div>
      <div className="t-spread">
        <b className="mono">{m ? px(m.mid, spec) : "—"}</b>
        <span className="muted mono">{m ? `spread ${px(m.book.spread, spec)} · ${((m.book.spread / m.mid) * 10000).toFixed(1)} bps` : ""}</span>
      </div>
      <div className="t-book-side">{bids.map(l => row(l, "bid"))}</div>
      <div className="t-book-f">
        <div className="t-ratio" aria-label={`Bids ${bidShare.toFixed(0)} percent of visible depth`}>
          <i style={{ width: bidShare + "%" }} />
          <span className="up">B {bidShare.toFixed(0)}%</span><span className="down">{(100 - bidShare).toFixed(0)}% S</span>
        </div>
        <select aria-label="Group price levels" value={g} onChange={e => setG(Number(e.target.value))}>
          {spec.groups.map((s, i) => <option key={s} value={i}>{s.toFixed(Math.max(0, -Math.floor(Math.log10(s) + 1e-9)))}</option>)}
        </select>
      </div>
    </div>
  );
}

export function TradesTape({ m, spec }: { m: MarketState | undefined; spec: MarketSpec }) {
  return (
    <div className="t-tape">
      <div className="t-book-h"><span>Price</span><span>Size</span><span>Time</span></div>
      {(m?.trades ?? []).map((t, i) => (
        <div key={t.t + ":" + i} className="t-tape-r">
          <span className={t.side === "buy" ? "up" : "down"}>{px(t.px, spec)}</span>
          <span>{spec.szDecimals ? t.sz.toFixed(2) : fmt.compact(t.sz)}</span>
          <span className="muted">{fmt.time(t.t)}</span>
        </div>
      ))}
    </div>
  );
}

/* ---------------- order entry ---------------- */
export interface EntryState { side: Side; type: OrderType; price: string; size: string; lev: number; reduceOnly: boolean }

export function OrderEntry({ m, spec, acc, entry, setEntry, onSubmit, onReset, marks }: {
  m: MarketState | undefined; spec: MarketSpec; acc: Account; entry: EntryState; setEntry(e: Partial<EntryState>): void;
  onSubmit(): void; onReset(): void; marks: Partial<Record<MarketSymbol, number>>;
}) {
  const { side, type, price, size, lev, reduceOnly } = entry;
  const perp = spec.kind === "perp";
  const sz = parseFloat(size) || 0;
  const limitPx = parseFloat(price) || 0;
  const pos = acc.perps[spec.symbol];
  const avail = availableUsd(acc);

  const refPx = type === "limit" && limitPx ? limitPx : (side === "buy" ? m?.book.asks[0]?.px : m?.book.bids[0]?.px) ?? m?.mid ?? 0;
  const est = m && type === "market" && sz ? walkBook(side === "buy" ? m.book.asks : m.book.bids, sz, undefined, side) : null;
  const fillPx = est?.filled ? est.avgPx : refPx;
  const notional = sz * fillPx;
  const fee = notional * (type === "market" ? spec.takerFee : spec.makerFee);
  const margin = perp ? notional / lev : notional;
  const slip = est?.filled && m ? (Math.abs(est.avgPx - m.mid) / m.mid) * 100 : 0;
  const liq = perp && sz && fillPx ? (() => {
    const dir = side === "buy" ? 1 : -1;
    const base = pos && Math.sign(pos.size) === dir ? pos : null;
    const size2 = (base?.size ?? 0) + dir * sz;
    const entry2 = base ? (base.entry * Math.abs(base.size) + fillPx * sz) / Math.abs(size2) : fillPx;
    return liqPrice({ market: spec.symbol, size: size2, entry: entry2, margin: (base?.margin ?? 0) + margin });
  })() : null;

  // max size for the % buttons
  const maxSize = (() => {
    if (!refPx) return 0;
    if (perp) {
      if (reduceOnly) return Math.abs(pos?.size ?? 0);
      return (avail * lev) / (refPx * (1 + spec.takerFee * lev));
    }
    return side === "buy" ? avail / (refPx * (1 + spec.takerFee)) : Math.max(0, acc.mako - reservedMako(acc));
  })();
  const setPct = (p: number) => {
    const v = maxSize * p;
    const dd = spec.szDecimals;
    setEntry({ size: v > 0 ? String(Math.floor(v * 10 ** dd) / 10 ** dd) : "" });
  };

  const eq = equity(acc, marks);
  const upnlTotal = Object.values(acc.perps).reduce((s2, p) => s2 + (p ? upnl(p, marks[p.market] ?? p.entry) : 0), 0) + (acc.mako ? acc.mako * ((marks["MAKO-USD"] ?? acc.makoCost) - acc.makoCost) : 0);
  const num = (v: string, dec: number) => v.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1").replace(new RegExp(`(\\.\\d{${dec}}).*`), "$1");

  return (
    <div className="t-entry">
      <div className="t-side" role="tablist" aria-label="Side">
        <button role="tab" aria-selected={side === "buy"} className={side === "buy" ? "on buy" : ""} onClick={() => setEntry({ side: "buy" })}>{perp ? "Buy / Long" : "Buy"}</button>
        <button role="tab" aria-selected={side === "sell"} className={side === "sell" ? "on sell" : ""} onClick={() => setEntry({ side: "sell" })}>{perp ? "Sell / Short" : "Sell"}</button>
      </div>
      <div className="seg t-type">
        {(["market", "limit"] as const).map(t => <button key={t} className={type === t ? "on" : ""} onClick={() => setEntry({ type: t, price: t === "limit" && !price && m ? px(m.mid, spec) : price })}>{t === "market" ? "Market" : "Limit"}</button>)}
      </div>

      <div className="t-avail"><span>Available</span><b className="mono">{side === "sell" && !perp ? `${fmtSz(Math.max(0, acc.mako - reservedMako(acc)), spec.symbol)} MAKO` : usd(avail)}</b></div>

      {type === "limit" && (
        <label className="t-field">
          <span>Price</span>
          <input inputMode="decimal" value={price} onChange={e => setEntry({ price: num(e.target.value, spec.pxDecimals) })} placeholder="0.00" aria-label="Limit price" />
          <button type="button" className="t-unit" onClick={() => m && setEntry({ price: px(m.mid, spec) })}>Mid</button>
        </label>
      )}
      <label className="t-field">
        <span>Size</span>
        <input inputMode="decimal" value={size} onChange={e => setEntry({ size: num(e.target.value, spec.szDecimals) })} placeholder="0" aria-label={`Size in ${spec.base}`} />
        <span className="t-unit">{spec.base}</span>
      </label>
      <div className="t-pcts">{[0.25, 0.5, 0.75, 1].map(p => <button key={p} onClick={() => setPct(p)}>{p * 100}%</button>)}</div>

      {perp && (
        <div className="t-lev">
          <div className="row between"><span>Leverage</span><b className="mono">{lev}x</b></div>
          <input type="range" min={1} max={spec.maxLeverage} step={1} value={lev} onChange={e => setEntry({ lev: Number(e.target.value) })} aria-label="Leverage" />
          <div className="t-lev-ticks">{[1, 5, 10, 15, 20].filter(v => v <= spec.maxLeverage).map(v => <button key={v} onClick={() => setEntry({ lev: v })}>{v}x</button>)}</div>
          <label className="t-check"><input type="checkbox" checked={reduceOnly} onChange={e => setEntry({ reduceOnly: e.target.checked })} />Reduce only</label>
        </div>
      )}

      <div className="t-sum">
        <div><span>Order value</span><b>{notional ? usd(notional) : "—"}</b></div>
        {perp && <div><span>Margin required</span><b>{notional && !reduceOnly ? usd(margin) : "—"}</b></div>}
        {type === "market" && <div><span>Est. slippage</span><b className={slip > 0.5 ? "down" : ""}>{est?.filled ? slip.toFixed(3) + "%" : "—"}</b></div>}
        <div><span>Fee ({((type === "market" ? spec.takerFee : spec.makerFee) * 100).toFixed(3)}%)</span><b>{notional ? usd(fee, 4) : "—"}</b></div>
        {perp && !reduceOnly && <div><span>Est. liq. price</span><b className="warnc">{liq && liq > 0 ? px(liq, spec) : "—"}</b></div>}
      </div>

      <button className={"btn btn-lg btn-block t-submit " + side} disabled={!sz || !m} onClick={onSubmit}>
        {side === "buy" ? (perp ? "Buy / Long" : "Buy") : perp ? "Sell / Short" : "Sell"} {spec.base}
      </button>

      <div className="t-acct">
        <div className="row between"><h4>Paper account</h4><button className="t-link" onClick={() => { if (confirm("Reset the paper account to $10,000? Orders, positions and history are cleared.")) onReset(); }}><RotateCcw className="ico ico-sm" />Reset</button></div>
        <div><span>Equity</span><b>{usd(eq)}</b></div>
        <div><span>Total PnL</span><b className={cls(eq - START_USD)}>{signed(eq - START_USD)} ({(((eq - START_USD) / START_USD) * 100).toFixed(2)}%)</b></div>
        <div><span>Unrealized</span><b className={cls(upnlTotal)}>{signed(upnlTotal)}</b></div>
        <div><span>Margin used</span><b>{usd(marginUsed(acc))}</b></div>
        <div><span>USD cash</span><b>{usd(acc.usd)}</b></div>
        <div><span>MAKO</span><b>{fmtSz(acc.mako, "MAKO-USD")}</b></div>
        <div><span>Fees paid</span><b>{usd(acc.fees)}</b></div>
      </div>
    </div>
  );
}

/* ---------------- account tabs ---------------- */
type Tab = "positions" | "orders" | "history" | "fills";

export function AccountTabs({ acc, marks, onCancel, onCancelAll, onClose, onSelect }: {
  acc: Account; marks: Partial<Record<MarketSymbol, number>>;
  onCancel(id: string): void; onCancelAll(): void; onClose(m: MarketSymbol, pct: number): void; onSelect(m: MarketSymbol): void;
}) {
  const [tab, setTab] = useState<Tab>("positions");
  const perps = Object.values(acc.perps).filter(Boolean) as NonNullable<Account["perps"][MarketSymbol]>[];
  const nPos = perps.length + (acc.mako > 0 ? 1 : 0);
  const makoMark = marks["MAKO-USD"] ?? acc.makoCost;
  const tabs: [Tab, string][] = [["positions", `Positions (${nPos})`], ["orders", `Open orders (${acc.open.length})`], ["history", "Order history"], ["fills", "Trade history"]];

  return (
    <div className="t-tabs">
      <div className="t-tabs-h">
        <div className="t-tablist" role="tablist">
          {tabs.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>)}
        </div>
        {tab === "orders" && acc.open.length > 0 && <button className="btn btn-ghost btn-sm" onClick={onCancelAll}>Cancel all</button>}
      </div>
      <div className="t-tabs-b">
        {tab === "positions" && (
          <table className="tbl t-tbl">
            <thead><tr><th>Market</th><th className="r">Size</th><th className="r">Entry</th><th className="r">Mark</th><th className="r hide-xs">Liq.</th><th className="r hide-xs">Margin</th><th className="r">PnL</th><th className="r">Close</th></tr></thead>
            <tbody>
              {nPos === 0 && <tr><td colSpan={8} className="empty">No open positions</td></tr>}
              {perps.map(p => {
                const spec = MARKETS[p.market], mark = marks[p.market] ?? p.entry, u = upnl(p, mark);
                return (
                  <tr key={p.market}>
                    <td><button className="t-link" onClick={() => onSelect(p.market)}>{p.market}</button> <span className={"tag " + (p.size > 0 ? "ok" : "hot")}>{p.size > 0 ? "LONG" : "SHORT"} {roundTo((Math.abs(p.size) * p.entry) / p.margin, 1)}x</span></td>
                    <td className={"r " + (p.size > 0 ? "up" : "down")}>{fmtSz(p.size, p.market)}</td>
                    <td className="r">{px(p.entry, spec)}</td>
                    <td className="r">{px(mark, spec)}</td>
                    <td className="r hide-xs warnc">{px(Math.max(0, liqPrice(p)), spec)}</td>
                    <td className="r hide-xs">{usd(p.margin)}</td>
                    <td className={"r " + cls(u)}>{signed(u)} <small>({((u / p.margin) * 100).toFixed(1)}%)</small></td>
                    <td className="r t-close"><button onClick={() => onClose(p.market, 0.5)}>50%</button><button onClick={() => onClose(p.market, 1)}>Market</button></td>
                  </tr>
                );
              })}
              {acc.mako > 0 && (() => {
                const u = acc.mako * (makoMark - acc.makoCost);
                const spec = MARKETS["MAKO-USD"];
                return (
                  <tr>
                    <td><button className="t-link" onClick={() => onSelect("MAKO-USD")}>MAKO-USD</button> <span className="tag">SPOT</span></td>
                    <td className="r up">{fmtSz(acc.mako, "MAKO-USD")}</td>
                    <td className="r">{px(acc.makoCost, spec)}</td>
                    <td className="r">{px(makoMark, spec)}</td>
                    <td className="r hide-xs muted">—</td>
                    <td className="r hide-xs">{usd(acc.mako * makoMark)}</td>
                    <td className={"r " + cls(u)}>{signed(u)} <small>({acc.makoCost ? (((makoMark - acc.makoCost) / acc.makoCost) * 100).toFixed(1) : "0.0"}%)</small></td>
                    <td className="r t-close"><button onClick={() => onClose("MAKO-USD", 0.5)}>50%</button><button onClick={() => onClose("MAKO-USD", 1)}>Sell all</button></td>
                  </tr>
                );
              })()}
            </tbody>
          </table>
        )}
        {tab === "orders" && (
          <table className="tbl t-tbl">
            <thead><tr><th>Time</th><th>Market</th><th>Side</th><th className="r">Price</th><th className="r">Size</th><th className="r hide-xs">Filled</th><th className="r"></th></tr></thead>
            <tbody>
              {acc.open.length === 0 && <tr><td colSpan={7} className="empty">No open orders</td></tr>}
              {acc.open.map(o => (
                <tr key={o.id}>
                  <td>{fmt.time(o.t)}</td><td>{o.market}{o.reduceOnly && <span className="tag" style={{ marginLeft: 6 }}>RO</span>}</td>
                  <td className={o.side === "buy" ? "up" : "down"}>{o.side.toUpperCase()}</td>
                  <td className="r">{px(o.px, MARKETS[o.market])}</td>
                  <td className="r">{fmtSz(o.sz, o.market)}</td>
                  <td className="r hide-xs">{fmtSz(o.filled, o.market)}</td>
                  <td className="r"><button className="t-icon" aria-label="Cancel order" onClick={() => onCancel(o.id)}><X className="ico ico-sm" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {tab === "history" && (
          <table className="tbl t-tbl">
            <thead><tr><th>Time</th><th>Market</th><th>Type</th><th>Side</th><th className="r">Avg price</th><th className="r">Size</th><th className="r">Status</th></tr></thead>
            <tbody>
              {acc.history.length === 0 && <tr><td colSpan={7} className="empty">No orders yet</td></tr>}
              {acc.history.slice(0, 60).map(o => (
                <tr key={o.id} title={o.reason}>
                  <td>{fmt.time(o.t)}</td><td>{o.market}</td><td>{o.type}</td>
                  <td className={o.side === "buy" ? "up" : "down"}>{o.side.toUpperCase()}</td>
                  <td className="r">{o.avgPx ? px(o.avgPx, MARKETS[o.market]) : o.px ? px(o.px, MARKETS[o.market]) : "—"}</td>
                  <td className="r">{fmtSz(o.filled || o.sz, o.market)}</td>
                  <td className="r"><span className={"tag " + (o.status === "filled" ? "ok" : o.status === "rejected" ? "hot" : "")}>{o.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {tab === "fills" && (
          <table className="tbl t-tbl">
            <thead><tr><th>Time</th><th>Market</th><th>Side</th><th className="r">Price</th><th className="r">Size</th><th className="r hide-xs">Fee</th><th className="r">Realized</th></tr></thead>
            <tbody>
              {acc.fills.length === 0 && <tr><td colSpan={7} className="empty">No trades yet</td></tr>}
              {acc.fills.slice(0, 80).map(f => (
                <tr key={f.id}>
                  <td>{fmt.time(f.t)}</td>
                  <td>{f.market}{f.liquidity === "liquidation" && <span className="tag hot" style={{ marginLeft: 6 }}>LIQ</span>}</td>
                  <td className={f.side === "buy" ? "up" : "down"}>{f.side.toUpperCase()}</td>
                  <td className="r">{px(f.px, MARKETS[f.market])}</td>
                  <td className="r">{fmtSz(f.sz, f.market)}</td>
                  <td className="r hide-xs">{usd(f.fee, 4)}</td>
                  <td className={"r " + cls(f.realized)}>{f.realized ? signed(f.realized) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="t-note">Paper trading against the live preview book. Nothing here is on-chain. <Link href="/app/swap">Trade $MAKO on-chain</Link></p>
    </div>
  );
}
