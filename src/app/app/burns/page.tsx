"use client";
import { useLive } from "@/components/providers/LiveProvider";
import { AT_LAUNCH, BurnTag, PHASE3, Pending, TxLink } from "@/components/app/parts";
import { fmt } from "@/lib/format";

export default function BurnsPage() {
  const s = useLive();
  const token = !!s?.live?.token;
  return (
    <section className="view active">
      <div className="tiles" style={{ gridTemplateColumns: "repeat(4, minmax(0,1fr))" }}>
        <div className="tile"><small>Total burned</small><b>{token && s ? fmt.num(s.burned) : "—"}</b></div>
        <div className="tile"><small>% of supply</small><b>{token && s ? ((s.burned / s.supply) * 100).toFixed(3) + "%" : "—"}</b></div>
        <div className="tile"><small>Total supply</small><b>{s ? fmt.compact(s.supply - (token ? s.burned : 0)) : "—"}</b></div>
        <div className="tile"><small>Burns logged</small><b>{token && s ? fmt.num(s.burns.length) : "—"}</b></div>
      </div>
      <div className="panel">
        <div className="panel-h"><h3>Burn log</h3><div className="r"><span className="tag">burn address 0x…dEaD</span></div></div>
        <div className="panel-b">
          {token && (s?.burns.length ?? 0) > 0 ? (
            <table className="tbl">
              <thead><tr><th>Time</th><th>Reason</th><th className="r">Amount</th><th className="r hide-xs">Tx</th></tr></thead>
              <tbody>
                {(s?.burns ?? []).map(b => (
                  <tr key={b.tx}>
                    <td>{fmt.time(b.t)}</td><td><BurnTag b={b} /></td>
                    <td className="r">{fmt.num(b.amount)} MAKO</td>
                    <td className="r hide-xs"><TxLink hash={b.tx} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <Pending title={token ? "No burns yet" : "The burn log starts at launch"} note={token ? PHASE3 : AT_LAUNCH + " Every burn will be listed here with its transaction."} />}
        </div>
      </div>
    </section>
  );
}
