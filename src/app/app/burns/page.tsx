"use client";
import { useLive } from "@/components/providers/LiveProvider";
import { BurnTag, TxLink } from "@/components/app/parts";
import { fmt } from "@/lib/format";

export default function BurnsPage() {
  const s = useLive();
  return (
    <section className="view active">
      <div className="tiles" style={{ gridTemplateColumns: "repeat(4, minmax(0,1fr))" }}>
        <div className="tile"><small>Total burned</small><b>{s ? fmt.num(s.burned) : "—"}</b></div>
        <div className="tile"><small>% of supply</small><b>{s ? ((s.burned / s.supply) * 100).toFixed(3) + "%" : "—"}</b></div>
        <div className="tile"><small>Circulating</small><b>{s ? fmt.compact(s.supply - s.burned) : "—"}</b></div>
        <div className="tile"><small>Burns logged</small><b>{s ? fmt.num(s.burns.length) : "—"}</b></div>
      </div>
      <div className="panel">
        <div className="panel-h"><h3>Burn log</h3><div className="r"><span className="tag">burn address 0x…dEaD</span></div></div>
        <div className="panel-b">
          <table className="tbl">
            <thead><tr><th>Time</th><th>Reason</th><th className="r">Amount</th><th className="r hide-xs">Tx</th></tr></thead>
            <tbody>
              {(s?.burns ?? []).map(b => (
                <tr key={b.tx}>
                  <td>{fmt.time(b.t)}</td><td><BurnTag b={b} /></td>
                  <td className="r">{fmt.num(b.amount)} MAKO</td>
                  <td className="r hide-xs"><TxLink hash={b.tx} preview={s?.mode !== "live"} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
