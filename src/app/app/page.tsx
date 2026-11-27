"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { useLive } from "@/components/providers/LiveProvider";
import { AT_LAUNCH, BurnTag, FillsTable, LineChart, MoodHero, PHASE3, Pending } from "@/components/app/parts";
import { fmt } from "@/lib/format";

const usdCompact = (v: number) => "$" + fmt.compact(v);
const pxFmt = (v: number) => v.toFixed(2);

export default function Overview() {
  const s = useLive();
  const desk = !!s?.live?.quoting, token = !!s?.live?.token;
  const circ = s ? s.supply - s.burned : 0;
  const hist = useRef<number[]>([]);
  const [mids, setMids] = useState<number[]>([]);
  // seed with real 1m HyperCore candles, then append live mids
  useEffect(() => {
    fetch("/api/candles?market=HYPE-PERP&tf=1m&limit=180").then(r => r.json()).then(j => {
      const closes: number[] = (j?.candles ?? []).map((c: { c: number }) => c.c).filter((v: number) => v > 0);
      if (closes.length) { hist.current = [...closes, ...hist.current].slice(-240); setMids(hist.current); }
    }).catch(() => {});
  }, []);
  useEffect(() => { if (s?.mid && s.live?.market) { hist.current = [...hist.current, s.mid].slice(-240); setMids(hist.current); } }, [s]);
  const chg = s ? (s.mid / s.midOpen - 1) * 100 : 0;

  return (
    <section className="view active">
      <div className="tiles">
        <div className="tile"><small>HYPE-PERP</small><b>{s ? fmt.usd(s.mid, 3) : "—"}</b><div className={"d " + (chg >= 0 ? "up" : "down")}>{s ? fmt.pct(chg) + " 24h" : ""}</div></div>
        <div className="tile"><small>Funding (1h)</small><b>{s ? (s.funding * 100).toFixed(4) + "%" : "—"}</b><div className="d muted">HyperCore</div></div>
        <div className="tile"><small>Mood</small><b style={{ color: s?.mood.color }}>{s?.mood.label ?? "—"}</b><div className="d muted">from live funding</div></div>
        <div className="tile"><small>$MAKO price</small><b>{token && s ? fmt.usd(s.makoPrice, 6) : "—"}</b><div className="d muted">{token && s ? "mcap $" + fmt.compact(circ * s.makoPrice) : "at launch"}</div></div>
        <div className="tile"><small>Total burned</small><b>{token && s ? fmt.compact(s.burned) : "—"}</b><div className="d muted">{token && s ? ((s.burned / s.supply) * 100).toFixed(2) + "% of supply" : "at launch"}</div></div>
        <div className="tile"><small>Desk PnL</small><b className={desk ? "up" : ""}>{desk && s ? fmt.usd(s.pnl.total, 0) : "—"}</b><div className="d muted">{desk && s ? "+" + fmt.usd(s.pnl.session, 2) + " session" : s?.live?.desk ? "desk halted" : "at deploy"}</div></div>
      </div>

      <div className="g-2">
        <div className="panel">
          <div className="panel-h"><h3>{desk ? "Desk cumulative PnL" : "HYPE-PERP · live"}</h3>
            <div className="r"><Link className="btn btn-ghost btn-sm" href="/app/terminal">Open terminal <ArrowRight className="ico ico-sm" /></Link></div>
          </div>
          <div className="panel-b">{s && (desk ? <LineChart data={s.pnl.history} format={usdCompact} /> : <LineChart data={mids} color="#93d9ee" format={pxFmt} />)}</div>
        </div>
        <div className="panel">
          <div className="panel-h"><h3>Mood</h3><div className="r"><Link className="btn btn-ghost btn-sm" href="/app/mood">Details <ArrowRight className="ico ico-sm" /></Link></div></div>
          <div className="panel-b">
            <MoodHero s={s} />
            <div className="meter-l"><span>Feeding</span><span>Cruising</span><span>Breach</span></div>
          </div>
        </div>
      </div>

      <div className="g-2">
        <div className="panel">
          <div className="panel-h"><h3>{desk ? "Latest desk fills" : "Live trades · HYPE-PERP"}</h3><div className="r"><Link className="btn btn-ghost btn-sm" href="/app/desk">Open desk <ArrowRight className="ico ico-sm" /></Link></div></div>
          <div className="panel-b">
            {desk ? <FillsTable fills={s?.fills ?? []} limit={8} /> : (
              <table className="tbl">
                <thead><tr><th>Time</th><th>Side</th><th className="r">Size (HYPE)</th><th className="r">Price</th></tr></thead>
                <tbody>
                  {(s?.trades ?? []).slice(0, 8).map(t => (
                    <tr key={t.t + "" + t.px + t.sz}><td>{fmt.time(t.t)}</td><td className={t.side === "buy" ? "up" : "down"}>{t.side.toUpperCase()}</td><td className="r">{t.sz}</td><td className="r">{t.px.toFixed(3)}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
        <div className="panel">
          <div className="panel-h"><h3>Recent burns</h3><div className="r"><Link className="btn btn-ghost btn-sm" href="/app/burns">All <ArrowRight className="ico ico-sm" /></Link></div></div>
          <div className="panel-b">
            {token && (s?.burns.length ?? 0) > 0 ? (
              <table className="tbl"><tbody>
                {(s?.burns ?? []).slice(0, 7).map(b => (
                  <tr key={b.tx}><td>{fmt.ago(b.t)}</td><td><BurnTag b={b} /></td><td className="r">{fmt.num(b.amount)}</td></tr>
                ))}
              </tbody></table>
            ) : <Pending title={token ? "No burns yet" : "Burns start at launch"} note={token ? PHASE3 : AT_LAUNCH} />}
          </div>
        </div>
      </div>
    </section>
  );
}
