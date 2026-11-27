"use client";
import { useEffect, useRef, useState } from "react";
import { useLive } from "@/components/providers/LiveProvider";
import { Fin } from "@/components/icons";
import { fmt, MOOD_META } from "@/lib/format";
import { MOODS } from "@/lib/moods";
import type { DeskState } from "@/lib/types";

function drawChart(canvas: HTMLCanvasElement, hist: number[], s: DeskState) {
  if (hist.length < 3 || !canvas.clientWidth) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth, h = canvas.clientHeight;
  canvas.width = w * dpr; canvas.height = h * dpr;
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const bid = s.book.bids[0].px, ask = s.book.asks[0].px;
  const vals = hist.concat([bid - 0.02, ask + 0.02]);
  let min = Math.min(...vals), max = Math.max(...vals);
  const pad = (max - min) * 0.15 || 0.05; min -= pad; max += pad;
  const padR = 92, padB = 8, padT = 8;
  const plotW = w - padR, plotLeftW = plotW * 0.58;
  const y = (v: number) => padT + (1 - (v - min) / (max - min)) * (h - padT - padB);
  const x = (i: number) => (i / (hist.length - 1)) * plotLeftW;

  ctx.font = "12px 'Geist Mono', monospace";
  ctx.textBaseline = "middle";
  for (let i = 0; i <= 5; i++) {
    const v = max - (i * (max - min)) / 5, gy = y(v);
    ctx.strokeStyle = "rgba(22,59,68,.7)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(plotW, gy); ctx.stroke();
    ctx.fillStyle = "#5f828b"; ctx.fillText(v.toFixed(3), plotW + 12, gy);
  }

  const zx = plotLeftW + 6, zw = plotW - zx;
  ctx.fillStyle = "rgba(62,230,168,.13)"; ctx.fillRect(zx, y(bid), zw, h - padB - y(bid));
  ctx.fillStyle = "rgba(255,82,82,.13)"; ctx.fillRect(zx, padT, zw, y(ask) - padT);
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = "rgba(62,230,168,.55)"; ctx.beginPath(); ctx.moveTo(zx, y(bid)); ctx.lineTo(plotW, y(bid)); ctx.stroke();
  ctx.strokeStyle = "rgba(255,82,82,.55)"; ctx.beginPath(); ctx.moveTo(zx, y(ask)); ctx.lineTo(plotW, y(ask)); ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = "rgba(147,179,187,.35)"; ctx.beginPath(); ctx.moveTo(zx, padT); ctx.lineTo(zx, h - padB); ctx.stroke();

  ctx.lineWidth = 2; ctx.lineJoin = "round"; ctx.strokeStyle = "#ffffff";
  ctx.beginPath(); hist.forEach((v, i) => (i ? ctx.lineTo(x(i), y(v)) : ctx.moveTo(x(i), y(v)))); ctx.stroke();
  const lx = x(hist.length - 1), ly = y(hist[hist.length - 1]);
  ctx.fillStyle = "#34b7dd"; ctx.beginPath(); ctx.arc(lx, ly, 4.5, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "rgba(52,183,221,.5)"; ctx.setLineDash([2, 3]);
  ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(plotW, ly); ctx.stroke(); ctx.setLineDash([]);

  ctx.font = "600 12px 'DM Sans', sans-serif"; ctx.textAlign = "right";
  ctx.fillStyle = "#ff5252"; ctx.fillText("Desk ask " + ask.toFixed(3), plotW - 8, y(ask) - 12);
  ctx.fillStyle = "#3ee6a8"; ctx.fillText("Desk bid " + bid.toFixed(3), plotW - 8, y(bid) + 14);
  ctx.textAlign = "left";
  ctx.font = "600 12px 'Geist Mono', monospace";
  const txt = hist[hist.length - 1].toFixed(3), tw = ctx.measureText(txt).width + 12;
  ctx.fillStyle = "#34b7dd"; ctx.fillRect(plotW + 4, ly - 10, tw, 20);
  ctx.fillStyle = "#04181c"; ctx.fillText(txt, plotW + 10, ly + 1);
}

export function DeskWidget() {
  const s = useLive();
  const [tab, setTab] = useState<"book" | "mood">("book");
  const canvas = useRef<HTMLCanvasElement>(null);
  const hist = useRef<number[]>([]);
  const lastFill = useRef<number>(0);
  const [fills, setFills] = useState(0);

  useEffect(() => {
    if (!s) return;
    hist.current.push(s.mid);
    if (hist.current.length > 120) hist.current.shift();
    const f = s.fills[0];
    if (f && f.t !== lastFill.current) { lastFill.current = f.t; setFills(n => n + 1); }
    if (tab === "book" && canvas.current) drawChart(canvas.current, hist.current, s);
  }, [s, tab]);

  useEffect(() => {
    const onResize = () => { if (s && canvas.current) drawChart(canvas.current, hist.current, s); };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [s]);

  const chg = s ? (s.mid / s.midOpen - 1) * 100 : 0;
  const meta = s ? MOOD_META[s.mood.key] : MOOD_META.cruising;

  return (
    <div className="widget reveal">
      <div className="widget-bar">
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === "book"} className={tab === "book" ? "on" : ""} onClick={() => setTab("book")}>Order book</button>
          <button role="tab" aria-selected={tab === "mood"} className={tab === "mood" ? "on" : ""} onClick={() => setTab("mood")}>Mood</button>
        </div>
        {(!s || s.mode === "preview") && <span className="pill warn live" title="Simulated until the HyperCore precompile ships"><span className="dot" />Preview data</span>}
      </div>

      {tab === "book" ? (
        <div className="widget-body">
          <div className="w-left">
            <span className="w-cat">HyperCore · Perpetual</span>
            <div className="w-title">Where is the desk quoting HYPE right now?</div>
            <div className="w-price"><span>{s ? fmt.usd(s.mid, 3) : "—"}</span><small className={chg >= 0 ? "up" : "down"}>{s ? fmt.pct(chg) + " 24h" : ""}</small></div>
            <div className="quotes">
              <div className="q bid"><small>Desk bid</small><b>{s ? s.book.bids[0].px.toFixed(3) : "—"}</b></div>
              <div className="q ask"><small>Desk ask</small><b>{s ? s.book.asks[0].px.toFixed(3) : "—"}</b></div>
              <div className="q neu"><small>Spread</small><b>{s ? ((s.book.spread / s.mid) * 10000).toFixed(1) + " bps" : "—"}</b></div>
              <div className="q neu"><small>Fills · session</small><b>{fmt.num(fills)}</b></div>
            </div>
            <div className="w-foot"><span>Read every ~70 ms · 0 oracles</span><span>{s ? s.latency + " ms" : ""}</span></div>
          </div>
          <div className="w-right"><canvas ref={canvas} /></div>
        </div>
      ) : (
        <div className="widget-body">
          <div className="w-left">
            <span className="w-cat">Mood Engine</span>
            <div className="w-title">Set by HyperCore funding and liquidations.</div>
            <div className="moodlist">
              {MOODS.map(m => (
                <div key={m.key} className={s?.mood.key === m.key ? "on" : ""}>
                  <i style={{ background: m.color }} /><span>{m.label}</span><span>{MOOD_META[m.key].range}</span>
                </div>
              ))}
            </div>
            <div className="w-foot"><span>Funding 1h</span><span>{s ? (s.funding * 100).toFixed(4) + "%" : "—"}</span></div>
          </div>
          <div className="w-right">
            <div className="mood-big">
              <div>
                <Fin className="fin" style={{ color: s?.mood.color ?? "#93d9ee", margin: "0 auto" }} />
                <h3 style={{ color: s?.mood.color }}>{s?.mood.label ?? "Cruising"}</h3>
                <p>{s?.mood.desc}</p>
                <div className="lp-meter"><i style={{ left: meta.pos + "%" }} /></div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
