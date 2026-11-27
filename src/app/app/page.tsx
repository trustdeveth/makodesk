"use client";
import Link from "next/link";
import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { useLive } from "@/components/providers/LiveProvider";
import { BurnTag, FillsTable, LineChart, MoodHero } from "@/components/app/parts";
import { fmt } from "@/lib/format";

const usdCompact = (v: number) => "$" + fmt.compact(v);

export default function Overview() {
  const s = useLive();
  const [range, setRange] = useState("7D");
  const circ = s ? s.supply - s.burned : 0;

  return (
    <section className="view active">
      <div className="tiles">
        <div className="tile"><small>$MAKO price</small><b>{s ? fmt.usd(s.makoPrice, 6) : "—"}</b><div className="d up">{s ? fmt.pct(s.makoChange) + " 24h" : ""}</div></div>
        <div className="tile"><small>Market cap</small><b>{s ? "$" + fmt.compact(circ * s.makoPrice) : "—"}</b><div className="d muted">circulating</div></div>
        <div className="tile"><small>Total burned</small><b>{s ? fmt.compact(s.burned) : "—"}</b><div className="d muted">{s ? ((s.burned / s.supply) * 100).toFixed(2) + "% of supply" : ""}</div></div>
        <div className="tile"><small>Desk treasury</small><b>{s ? "$" + fmt.compact(s.treasury.usd) : "—"}</b><div className="d muted">HYPE + MAKO</div></div>
        <div className="tile"><small>Desk PnL</small><b className="up">{s ? fmt.usd(s.pnl.total, 0) : "—"}</b><div className="d up">{s ? "+" + fmt.usd(s.pnl.session, 2) + " session" : ""}</div></div>
        <div className="tile"><small>Holders</small><b>{s ? fmt.num(s.holders) : "—"}</b><div className="d muted">on Elysium</div></div>
      </div>

      <div className="g-2">
        <div className="panel">
          <div className="panel-h"><h3>Desk cumulative PnL</h3>
            <div className="r"><div className="seg">{["1H", "24H", "7D"].map(r => <button key={r} className={range === r ? "on" : ""} onClick={() => setRange(r)}>{r}</button>)}</div></div>
          </div>
          <div className="panel-b">{s && <LineChart data={s.pnl.history} format={usdCompact} />}</div>
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
          <div className="panel-h"><h3>Latest desk fills</h3><div className="r"><Link className="btn btn-ghost btn-sm" href="/app/desk">Open desk <ArrowRight className="ico ico-sm" /></Link></div></div>
          <div className="panel-b"><FillsTable fills={s?.fills ?? []} limit={8} /></div>
        </div>
        <div className="panel">
          <div className="panel-h"><h3>Recent burns</h3><div className="r"><Link className="btn btn-ghost btn-sm" href="/app/burns">All <ArrowRight className="ico ico-sm" /></Link></div></div>
          <div className="panel-b">
            <table className="tbl"><tbody>
              {(s?.burns ?? []).slice(0, 7).map(b => (
                <tr key={b.tx}><td>{fmt.ago(b.t)}</td><td><BurnTag b={b} /></td><td className="r">{fmt.num(b.amount)}</td></tr>
              ))}
            </tbody></table>
          </div>
        </div>
      </div>
    </section>
  );
}
