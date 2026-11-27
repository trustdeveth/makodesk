"use client";
import { useEffect, useState } from "react";
import { useLive } from "@/components/providers/LiveProvider";
import { fmt } from "@/lib/format";
import type { DeskState } from "@/lib/types";

const Chg = ({ v }: { v: number }) => <i className={v >= 0 ? "up" : "down"}>{fmt.pct(v)}</i>;

function Items({ s }: { s: DeskState }) {
  const items: [string, string, number | null][] = [
    ["$MAKO", fmt.usd(s.makoPrice, 6), s.makoChange],
    ["HYPE-PERP", fmt.usd(s.mid, 3), (s.mid / s.midOpen - 1) * 100],
    ["Funding 1h", (s.funding * 100).toFixed(4) + "%", null],
    ["Burned", fmt.compact(s.burned) + " MAKO", null],
    ["Desk PnL", fmt.usd(s.pnl.total, 0), null],
    ["Mood", s.mood.label, null],
    ["Block time", "100 ms", null],
    ["Gas", "HYPE", null],
  ];
  return <>{items.map(([k, v, c]) => <span key={k}>{k} <b>{v}</b>{c !== null && <Chg v={c} />}</span>)}</>;
}

export function TickerBand() {
  const live = useLive();
  // throttle re-renders so the marquee stays smooth
  const [snap, setSnap] = useState<DeskState | null>(null);
  useEffect(() => {
    if (live && (!snap || Date.now() - snap.t > 4000)) setSnap(live);
  }, [live, snap]);

  return (
    <div className="band">
      <div className="band-label">Live desk.<br />Every block.</div>
      <div className="band-track-wrap">
        <div className="band-track">
          {snap && <><Items s={snap} /><Items s={snap} /></>}
        </div>
      </div>
    </div>
  );
}
