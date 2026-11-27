"use client";
import { useEffect, useRef, useState } from "react";
import { useLive } from "@/components/providers/LiveProvider";
import { Fin } from "@/components/icons";
import { fmt, MOOD_META } from "@/lib/format";
import { MOODS } from "@/lib/moods";
import type { DeskState } from "@/lib/types";

/* ------------------------------------------------------------------ */
/*  Smooth live chart: time-scrolling spline, eased scale + bands      */
/* ------------------------------------------------------------------ */
interface Pt { t: number; v: number }
const WINDOW_MS = 60_000;
const STEP = 1200;
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

function useLiveChart(canvasRef: React.RefObject<HTMLCanvasElement | null>, s: DeskState | null, active: boolean) {
  const pts = useRef<Pt[]>([]);
  const ema = useRef(0);
  const latest = useRef<DeskState | null>(null);
  const view = useRef({ min: 0, max: 0, bid: 0, ask: 0, head: 0, ready: false });

  // record samples
  useEffect(() => {
    if (!s) return;
    latest.current = s;
    const now = performance.now();
    if (pts.current.length === 0) {
      // short backfill so the chart opens full
      let v = s.mid, d = 0;
      const seed: Pt[] = [];
      for (let i = 1; i <= 52; i++) { d = d * 0.85 + (Math.random() - 0.5) * 0.006; v -= d; seed.unshift({ t: now - i * STEP, v }); }
      pts.current = seed;
      ema.current = s.mid;
    }
    // smooth the raw feed, then keep one point per STEP (the newest point tracks live until it is committed)
    ema.current += (s.mid - ema.current) * 0.55;
    const P = pts.current, lastP = P[P.length - 1];
    if (now - lastP.t >= STEP) P.push({ t: now, v: ema.current });
    const cutoff = now - WINDOW_MS - 4000;
    while (pts.current.length > 2 && pts.current[0].t < cutoff) pts.current.shift();
  }, [s]);

  // render loop
  useEffect(() => {
    if (!active) return;
    let raf = 0, last = performance.now();
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      const canvas = canvasRef.current, st = latest.current;
      if (!canvas || !st || pts.current.length < 2 || !canvas.clientWidth) return;
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
      const ctx = canvas.getContext("2d")!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const P = pts.current, vw = view.current;
      const bid = st.book.bids[0].px, ask = st.book.asks[0].px;
      // target range from visible data + quotes
      let lo = Infinity, hi = -Infinity;
      for (const p of P) { if (p.v < lo) lo = p.v; if (p.v > hi) hi = p.v; }
      lo = Math.min(lo, ema.current); hi = Math.max(hi, ema.current);
      lo = Math.min(lo, bid); hi = Math.max(hi, ask);
      const pad = Math.max((hi - lo) * 0.22, 0.01); lo -= pad; hi += pad;
      const k = vw.ready ? 1 - Math.exp(-dt * 4) : 1;
      vw.min = lerp(vw.min, lo, k); vw.max = lerp(vw.max, hi, k);
      vw.bid = lerp(vw.bid, bid, vw.ready ? 1 - Math.exp(-dt * 8) : 1);
      vw.ask = lerp(vw.ask, ask, vw.ready ? 1 - Math.exp(-dt * 8) : 1);
      vw.head = lerp(vw.head, ema.current, vw.ready ? 1 - Math.exp(-dt * 9) : 1);
      vw.ready = true;

      const padR = 84, padT = 14, padB = 14;
      const plotW = w - padR, nowX = plotW * 0.7;
      const X = (t: number) => nowX - ((now - t) / WINDOW_MS) * nowX;
      const Y = (v: number) => padT + (1 - (v - vw.min) / (vw.max - vw.min)) * (h - padT - padB);

      // grid + axis
      ctx.font = "11px 'Geist Mono', monospace"; ctx.textBaseline = "middle"; ctx.textAlign = "left";
      for (let i = 0; i <= 4; i++) {
        const v = vw.max - (i * (vw.max - vw.min)) / 4, gy = Y(v);
        ctx.strokeStyle = "rgba(147,179,187,.07)"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(plotW, gy); ctx.stroke();
        if (Math.abs(gy - Y(vw.head)) > 16) { ctx.fillStyle = "#5f828b"; ctx.fillText(v.toFixed(3), plotW + 12, gy); }
      }

      // quote zones (fade in from the "now" line)
      const yb = Y(vw.bid), ya = Y(vw.ask);
      const gA = ctx.createLinearGradient(nowX, 0, plotW, 0);
      gA.addColorStop(0, "rgba(255,82,82,.16)"); gA.addColorStop(1, "rgba(255,82,82,.03)");
      ctx.fillStyle = gA; ctx.fillRect(nowX, padT, plotW - nowX, ya - padT);
      const gB = ctx.createLinearGradient(nowX, 0, plotW, 0);
      gB.addColorStop(0, "rgba(62,230,168,.16)"); gB.addColorStop(1, "rgba(62,230,168,.03)");
      ctx.fillStyle = gB; ctx.fillRect(nowX, yb, plotW - nowX, h - padB - yb);
      ctx.setLineDash([3, 4]); ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(255,82,82,.6)"; ctx.beginPath(); ctx.moveTo(nowX, ya); ctx.lineTo(plotW, ya); ctx.stroke();
      ctx.strokeStyle = "rgba(62,230,168,.6)"; ctx.beginPath(); ctx.moveTo(nowX, yb); ctx.lineTo(plotW, yb); ctx.stroke();
      ctx.setLineDash([]);
      const gNow = ctx.createLinearGradient(0, padT, 0, h - padB);
      gNow.addColorStop(0, "rgba(147,179,187,0)"); gNow.addColorStop(0.5, "rgba(147,179,187,.35)"); gNow.addColorStop(1, "rgba(147,179,187,0)");
      ctx.strokeStyle = gNow; ctx.beginPath(); ctx.moveTo(nowX, padT); ctx.lineTo(nowX, h - padB); ctx.stroke();

      // spline path (Catmull-Rom -> Bezier), last point eased to the live head
      const pts2 = P.map(p => ({ x: X(p.t), y: Y(p.v) })).filter(p => p.x > -60 && p.x < nowX - 6);
      pts2.push({ x: nowX, y: Y(vw.head) });
      const path = new Path2D();
      path.moveTo(pts2[0].x, pts2[0].y);
      for (let i = 0; i < pts2.length - 1; i++) {
        const p0 = pts2[Math.max(0, i - 1)], p1 = pts2[i], p2 = pts2[i + 1], p3 = pts2[Math.min(pts2.length - 1, i + 2)];
        const t = 0.16;
        path.bezierCurveTo(p1.x + (p2.x - p0.x) * t, p1.y + (p2.y - p0.y) * t, p2.x - (p3.x - p1.x) * t, p2.y - (p3.y - p1.y) * t, p2.x, p2.y);
      }
      // area
      const area = new Path2D(path);
      area.lineTo(nowX, h - padB); area.lineTo(pts2[0].x, h - padB); area.closePath();
      const gF = ctx.createLinearGradient(0, padT, 0, h - padB);
      gF.addColorStop(0, "rgba(52,183,221,.28)"); gF.addColorStop(1, "rgba(52,183,221,0)");
      ctx.fillStyle = gF; ctx.fill(area);
      // line (fades in from the left edge)
      const gL = ctx.createLinearGradient(0, 0, nowX, 0);
      gL.addColorStop(0, "rgba(147,217,238,0)"); gL.addColorStop(0.18, "rgba(147,217,238,.85)"); gL.addColorStop(1, "#ffffff");
      ctx.strokeStyle = gL; ctx.lineWidth = 2; ctx.lineJoin = "round"; ctx.lineCap = "round";
      ctx.shadowColor = "rgba(52,183,221,.55)"; ctx.shadowBlur = 10;
      ctx.stroke(path); ctx.shadowBlur = 0;

      // head: pulse ring + dot + guide
      const hy = Y(vw.head);
      const pulse = (now % 1600) / 1600;
      ctx.strokeStyle = `rgba(52,183,221,${(1 - pulse) * 0.6})`; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(nowX, hy, 4 + pulse * 12, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = "#34b7dd"; ctx.beginPath(); ctx.arc(nowX, hy, 4.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#ffffff"; ctx.beginPath(); ctx.arc(nowX, hy, 1.8, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "rgba(52,183,221,.45)"; ctx.setLineDash([2, 3]); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(nowX + 8, hy); ctx.lineTo(plotW, hy); ctx.stroke(); ctx.setLineDash([]);

      // labels
      ctx.font = "600 11px 'DM Sans', sans-serif"; ctx.textAlign = "right";
      ctx.fillStyle = "#ff7a7a"; ctx.fillText("ASK " + ask.toFixed(3), plotW - 8, Math.max(padT + 8, ya - 11));
      ctx.fillStyle = "#3ee6a8"; ctx.fillText("BID " + bid.toFixed(3), plotW - 8, Math.min(h - padB - 8, yb + 12));
      ctx.textAlign = "left";
      ctx.font = "600 11px 'Geist Mono', monospace";
      const txt = vw.head.toFixed(3), tw = ctx.measureText(txt).width + 14;
      ctx.fillStyle = "#34b7dd";
      ctx.beginPath(); ctx.roundRect(plotW + 4, hy - 10, tw, 20, 5); ctx.fill();
      ctx.fillStyle = "#04181c"; ctx.fillText(txt, plotW + 11, hy + 1);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [active, canvasRef]);
}

/* ------------------------------------------------------------------ */
/*  Value that flashes green/red when it changes                       */
/* ------------------------------------------------------------------ */
function Flash({ value, children }: { value: number | null; children: React.ReactNode }) {
  const prev = useRef<number | null>(null);
  const [dir, setDir] = useState<"" | "up" | "down">("");
  const [n, setN] = useState(0);
  useEffect(() => {
    if (value == null) return;
    if (prev.current != null && value !== prev.current) { setDir(value > prev.current ? "up" : "down"); setN(x => x + 1); }
    prev.current = value;
  }, [value]);
  return <b key={n} className={"dw-flash " + dir}>{children}</b>;
}

export function DeskWidget() {
  const s = useLive();
  const [tab, setTab] = useState<"book" | "mood">("book");
  const canvas = useRef<HTMLCanvasElement>(null);
  const lastFill = useRef<number>(0);
  const [fills, setFills] = useState(0);
  useLiveChart(canvas, s, tab === "book");

  useEffect(() => {
    const f = s?.fills[0];
    if (f && f.t !== lastFill.current) { lastFill.current = f.t; setFills(n => n + 1); }
  }, [s]);

  const chg = s ? (s.mid / s.midOpen - 1) * 100 : 0;
  const meta = s ? MOOD_META[s.mood.key] : MOOD_META.cruising;
  const moodIdx = Math.max(0, MOODS.findIndex(m => m.key === s?.mood.key));
  const bid = s ? s.book.bids[0].px : null, ask = s ? s.book.asks[0].px : null;

  return (
    <div className="widget dw reveal">
      <div className="widget-bar">
        <div className="dw-tabs" role="tablist" data-tab={tab}>
          <span className="dw-tab-ind" aria-hidden="true" />
          <button role="tab" aria-selected={tab === "book"} className={tab === "book" ? "on" : ""} onClick={() => setTab("book")}>Order book</button>
          <button role="tab" aria-selected={tab === "mood"} className={tab === "mood" ? "on" : ""} onClick={() => setTab("mood")}>Mood</button>
        </div>
        {s?.live?.market && <span className="pill mint live" title="Streaming live from Hyperliquid"><span className="dot" />Live</span>}
      </div>

      {tab === "book" ? (
        <div className="widget-body dw-pane" key="book">
          <div className="w-left">
            <span className="w-cat"><i className="dw-live" />HyperCore · Perpetual</span>
            <div className="w-title">Where is HYPE trading on HyperCore right now?</div>
            <div className="w-price dw-price">
              <Flash value={s?.mid ?? null}>{s ? fmt.usd(s.mid, 3) : "—"}</Flash>
              <small className={chg >= 0 ? "up" : "down"}>{s ? fmt.pct(chg) + " 24h" : ""}</small>
            </div>
            <div className="quotes dw-quotes">
              <div className="q bid"><small>Best bid</small><Flash value={bid}>{bid != null ? bid.toFixed(3) : "—"}</Flash></div>
              <div className="q ask"><small>Best ask</small><Flash value={ask}>{ask != null ? ask.toFixed(3) : "—"}</Flash></div>
              <div className="q neu"><small>Spread</small><b>{s ? ((s.book.spread / s.mid) * 10000).toFixed(1) + " bps" : "—"}</b></div>
              <div className="q neu"><small>Funding 1h</small><b>{s ? (s.funding * 100).toFixed(4) + "%" : "—"}</b></div>
            </div>
            <div className="w-foot"><span>Live HyperCore book · 0 oracles</span><span className="mono">{s?.live?.market ? "Hyperliquid" : ""}</span></div>
          </div>
          <div className="w-right"><canvas ref={canvas} /></div>
        </div>
      ) : (
        <div className="widget-body dw-pane" key="mood">
          <div className="w-left">
            <span className="w-cat"><i className="dw-live" />Mood Engine</span>
            <div className="w-title">Set by HyperCore funding and liquidations.</div>
            <div className="moodlist dw-moods" style={{ ["--mi" as string]: moodIdx }}>
              <span className="dw-mood-ind" aria-hidden="true" style={{ borderColor: s?.mood.color }} />
              {MOODS.map(m => (
                <div key={m.key} className={s?.mood.key === m.key ? "on" : ""} style={{ ["--c" as string]: m.color }}>
                  <i style={{ background: m.color }} /><span>{m.label}</span><span>{MOOD_META[m.key].range}</span>
                </div>
              ))}
            </div>
            <div className="w-foot"><span>Funding 1h</span><span className="mono">{s ? (s.funding * 100).toFixed(4) + "%" : "—"}</span></div>
          </div>
          <div className="w-right">
            <div className="mood-big dw-mood" style={{ ["--c" as string]: s?.mood.color ?? "#93d9ee" }}>
              <div>
                <div className="dw-fin-wrap"><span className="dw-halo" /><Fin className="fin" /></div>
                <h3 key={s?.mood.key} className="dw-mood-name">{s?.mood.label ?? "Cruising"}</h3>
                <p key={"d" + s?.mood.key} className="dw-mood-desc">{s?.mood.desc}</p>
                <div className="lp-meter dw-meter"><i style={{ left: meta.pos + "%" }} /></div>
                <div className="dw-meter-l"><span>Feeding</span><span>Cruising</span><span>Breach</span></div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
