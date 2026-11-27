"use client";
import { useEffect, useRef } from "react";
import { Fin } from "@/components/icons";
import { fmt, MOOD_META } from "@/lib/format";
import type { Burn, DeskState, Fill } from "@/lib/types";
import { useConfig } from "@/components/providers/ConfigProvider";
import { ExternalLink, Hourglass } from "lucide-react";

/** Clean placeholder for data that switches on with a later phase / the token launch. */
export function Pending({ title, note, compact }: { title: string; note: string; compact?: boolean }) {
  return (
    <div className={"pending" + (compact ? " compact" : "")}>
      <span className="pending-ic"><Hourglass className="ico ico-sm" /></span>
      <b>{title}</b>
      <span>{note}</span>
    </div>
  );
}
export const PHASE3 = "MakoDesk is deployed on Elysium and halted. It starts quoting once CoreWriter is wired and the audit is done.";
export const AT_LAUNCH = "Goes live when $MAKO launches on Elysium.";

/** Canvas area/line chart with right-side axis labels. */
export function LineChart({ data, color = "#34b7dd", format = (v: number) => v.toFixed(2), height = 260 }: {
  data: number[]; color?: string; format?: (v: number) => string; height?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const draw = () => {
      const canvas = ref.current;
      if (!canvas || data.length < 2) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return;
      canvas.width = w * dpr; canvas.height = h * dpr;
      const ctx = canvas.getContext("2d")!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const padL = 4, padR = 68, padT = 12, padB = 16;
      const min = Math.min(...data), max = Math.max(...data), span = max - min || 1;
      const x = (i: number) => padL + (i / (data.length - 1)) * (w - padL - padR);
      const y = (v: number) => padT + (1 - (v - min) / span) * (h - padT - padB);

      ctx.font = "11px 'Geist Mono', monospace";
      ctx.fillStyle = "#5f828b"; ctx.strokeStyle = "rgba(22,59,68,.8)"; ctx.lineWidth = 1;
      for (let i = 0; i <= 4; i++) {
        const gy = padT + (i * (h - padT - padB)) / 4;
        ctx.beginPath(); ctx.moveTo(padL, gy); ctx.lineTo(w - padR + 8, gy); ctx.stroke();
        ctx.fillText(format(max - (i * span) / 4), w - padR + 14, gy + 4);
      }
      const g = ctx.createLinearGradient(0, padT, 0, h - padB);
      g.addColorStop(0, color + "55"); g.addColorStop(1, color + "00");
      ctx.beginPath();
      data.forEach((v, i) => (i ? ctx.lineTo(x(i), y(v)) : ctx.moveTo(x(i), y(v))));
      ctx.lineTo(x(data.length - 1), h - padB); ctx.lineTo(x(0), h - padB); ctx.closePath();
      ctx.fillStyle = g; ctx.fill();
      ctx.beginPath();
      data.forEach((v, i) => (i ? ctx.lineTo(x(i), y(v)) : ctx.moveTo(x(i), y(v))));
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.lineJoin = "round"; ctx.stroke();
      const lx = x(data.length - 1), ly = y(data[data.length - 1]);
      ctx.beginPath(); ctx.arc(lx, ly, 4, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
    };
    draw();
    window.addEventListener("resize", draw);
    return () => window.removeEventListener("resize", draw);
  }, [data, color, format]);
  return <div className="chart-wrap" style={{ height }}><canvas ref={ref} /></div>;
}

export function MoodHero({ s }: { s: DeskState | null }) {
  const c = s?.mood.color ?? "#93d9ee";
  return (
    <>
      <div className="mood-hero" style={{ ["--c" as string]: c }}>
        <div className="fin-wrap"><Fin /></div>
        <div>
          <h2 className="mood-name" style={{ color: c }}>{s?.mood.label ?? "—"}</h2>
          <p className="mood-desc">{s?.mood.desc ?? ""}</p>
        </div>
      </div>
      <div className="meter"><i style={{ left: (s ? MOOD_META[s.mood.key].pos : 50) + "%" }} /></div>
    </>
  );
}

export function FillsTable({ fills, limit }: { fills: Fill[]; limit: number }) {
  return (
    <table className="tbl">
      <thead><tr><th>Time</th><th>Market</th><th>Side</th><th className="r">Size</th><th className="r hide-xs">Price</th><th className="r">Edge</th></tr></thead>
      <tbody>
        {fills.length === 0 && <tr><td colSpan={6} className="empty">Waiting for fills…</td></tr>}
        {fills.slice(0, limit).map(f => (
          <tr key={f.t + f.market + f.sz}>
            <td>{fmt.time(f.t)}</td><td>{f.market}</td>
            <td className={f.side === "buy" ? "up" : "down"}>{f.side.toUpperCase()}</td>
            <td className="r">{f.sz}</td><td className="r hide-xs">{f.px.toFixed(3)}</td>
            <td className="r up">+${f.edge.toFixed(2)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function TxLink({ hash }: { hash: string }) {
  const cfg = useConfig();
  return (
    <a href={`${cfg.chain.explorer}/tx/${hash}`} target="_blank" rel="noopener">
      {fmt.short(hash)} <ExternalLink className="ico ico-sm" style={{ display: "inline", verticalAlign: -2 }} />
    </a>
  );
}

export const BurnTag = ({ b }: { b: Burn }) => <span className={"tag " + (b.reason === "Wick bonus" ? "hot" : "ok")}>{b.reason}</span>;
