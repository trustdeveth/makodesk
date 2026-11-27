"use client";
import { useLive } from "@/components/providers/LiveProvider";
import { MoodHero } from "@/components/app/parts";
import { fmt, MOOD_META } from "@/lib/format";
import { MOODS } from "@/lib/moods";

export default function MoodPage() {
  const s = useLive();
  return (
    <section className="view active">
      <div className="g-2">
        <div className="panel">
          <div className="panel-h"><h3>Current mood</h3><div className="r"><span className="muted mono" style={{ fontSize: 12 }}>{s ? "core #" + fmt.num(s.coreBlock) : ""}</span></div></div>
          <div className="panel-b">
            <MoodHero s={s} />
            <div className="meter-l"><span>Feeding</span><span>Hunting</span><span>Cruising</span><span>Circling</span><span>Breach</span></div>
            <div className="tiles" style={{ gridTemplateColumns: "repeat(3, minmax(0,1fr))", marginTop: 20 }}>
              <div className="tile"><small>Funding (1h)</small><b>{s ? (s.funding * 100).toFixed(4) + "%" : "—"}</b></div>
              <div className="tile"><small>HYPE mid</small><b>{s ? fmt.usd(s.mid, 3) : "—"}</b></div>
              <div className="tile"><small>Read latency</small><b>{s ? s.latency + " ms" : "—"}</b></div>
            </div>
          </div>
        </div>
        <div className="panel">
          <div className="panel-h"><h3>How mood drives the desk</h3></div>
          <div className="panel-b">
            <table className="tbl">
              <thead><tr><th>Mood</th><th>Funding</th><th className="r">Spread</th><th className="r">Burn rate</th></tr></thead>
              <tbody>
                {MOODS.map(m => (
                  <tr key={m.key} style={{ background: s?.mood.key === m.key ? "rgba(52,183,221,.08)" : undefined }}>
                    <td><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: m.color, marginRight: 8 }} />{m.label}</td>
                    <td>{MOOD_META[m.key].range}</td>
                    <td className="r">{MOOD_META[m.key].spread}</td>
                    <td className="r">{MOOD_META[m.key].burn}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="muted" style={{ fontSize: 13, marginTop: 14 }}>
              Mood is computed on-chain from HyperCore funding and liquidation flow at each HyperCore block (~70 ms). Anyone can call <code>MakoDesk.mood()</code> to read it.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
