"use client";
import { useEffect, useRef, useState } from "react";
import { useLive } from "@/components/providers/LiveProvider";
import { FillsTable, LineChart } from "@/components/app/parts";
import { fmt, MOOD_META } from "@/lib/format";
import type { BookLevel } from "@/lib/types";

const midFmt = (v: number) => v.toFixed(2);

function Level({ l, side, max }: { l: BookLevel; side: "bid" | "ask"; max: number }) {
  return (
    <div className={`lv ${side}${l.desk ? " desk" : ""}`}>
      <i style={{ width: ((l.cum / max) * 100).toFixed(1) + "%" }} />
      <span className="px">{l.px.toFixed(3)}</span>
      <span className="sz">{fmt.num(l.sz)}</span>
      <span>{fmt.compact(l.cum)}</span>
    </div>
  );
}

export default function DeskPage() {
  const s = useLive();
  const hist = useRef<number[]>([]);
  const [mids, setMids] = useState<number[]>([]);

  useEffect(() => {
    if (!s) return;
    hist.current = [...hist.current, s.mid].slice(-160);
    setMids(hist.current);
  }, [s]);

  if (!s) return <section className="view active"><div className="empty">Connecting to desk…</div></section>;

  const asks = s.book.asks.slice(0, 12).reverse(), bids = s.book.bids.slice(0, 12);
  const max = Math.max(...asks.map(l => l.cum), ...bids.map(l => l.cum));
  const skew = s.risk.skewPct;

  return (
    <section className="view active">
      <div className="g-desk">
        <div className="panel">
          <div className="panel-h"><h3>Order book</h3><div className="r"><span className="tag">HYPE-PERP</span></div></div>
          <div className="panel-b">
            <div className="ob">
              <div className="hd"><span>Price</span><span>Size</span><span>Total</span></div>
              {asks.map(l => <Level key={"a" + l.px} l={l} side="ask" max={max} />)}
              <div className="spread"><b>{s.mid.toFixed(3)}</b><span className="muted">{((s.book.spread / s.mid) * 10000).toFixed(1)} bps</span></div>
              {bids.map(l => <Level key={"b" + l.px} l={l} side="bid" max={max} />)}
            </div>
            <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>Highlighted rows are desk resting quotes</p>
          </div>
        </div>

        <div className="panel">
          <div className="panel-h"><h3>Desk activity</h3>
            <div className="r"><span className={"pill live " + (s.risk.paused ? "warn" : "mint")}><span className="dot" />{s.risk.paused ? "Wick mode" : "Quoting"}</span></div>
          </div>
          <div className="panel-b">
            <LineChart data={mids} color="#93d9ee" format={midFmt} height={220} />
            <div style={{ marginTop: 16 }}><FillsTable fills={s.fills} limit={10} /></div>
          </div>
        </div>

        <div style={{ display: "grid", gap: 16, alignContent: "start" }}>
          <div className="panel">
            <div className="panel-h"><h3>Risk limits</h3><div className="r"><span className="tag ok">on-chain</span></div></div>
            <div className="panel-b">
              <div className="gauge"><div className="lbl"><span>Position used</span><b>{s.risk.positionPct.toFixed(0)}%</b></div><div className="bar"><i style={{ width: s.risk.positionPct + "%" }} /></div></div>
              <div className="gauge"><div className="lbl"><span>Daily loss budget used</span><b>{s.risk.lossPct.toFixed(0)}%</b></div><div className="bar"><i style={{ width: s.risk.lossPct + "%" }} /></div></div>
              <div className="gauge" style={{ margin: 0 }}><div className="lbl"><span>Inventory skew</span><b>{skew > 50 ? "long " : "short "}{Math.abs(skew - 50).toFixed(0)}%</b></div><div className="bar"><i className={Math.abs(skew - 50) > 18 ? "w" : ""} style={{ width: skew + "%" }} /></div></div>
            </div>
          </div>
          <div className="panel">
            <div className="panel-h"><h3>Parameters</h3><div className="r"><span className="tag">timelock 48h</span></div></div>
            <div className="panel-b params">
              <div><span>Max position</span><span>2,500 HYPE</span></div>
              <div><span>Max daily loss</span><span>$4,000</span></div>
              <div><span>Base spread</span><span>{MOOD_META[s.mood.key].spread}</span></div>
              <div><span>Quote refresh</span><span>~100 ms</span></div>
              <div><span>Burn share of profit</span><span>80%</span></div>
              <div><span>Kill-switch</span><span className="up">armed</span></div>
            </div>
          </div>
          <div className="panel">
            <div className="panel-h"><h3>Tape</h3></div>
            <div className="panel-b">
              <div className="tape" style={{ maxHeight: 220 }}>
                {s.trades.slice(0, 16).map(t => (
                  <div key={t.t + "" + t.px + t.sz}><span className={t.side === "buy" ? "up" : "down"}>{t.px.toFixed(3)}</span><span>{t.sz}</span><span>{fmt.time(t.t)}</span></div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
