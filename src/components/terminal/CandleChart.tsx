"use client";
import { useCallback, useEffect, useRef } from "react";
import type { Candle } from "@/lib/types";

export interface PriceLine { px: number; color: string; label: string; dashed?: boolean }

interface Props {
  candles: Candle[];
  pxDecimals: number;
  tfMs: number;
  lines?: PriceLine[];
  showMA?: boolean;
  showVolume?: boolean;
}

const C = {
  up: "#3ee6a8", down: "#ff5252", grid: "rgba(22,59,68,.55)", axis: "#5f828b", text: "#93b3bb",
  cross: "rgba(147,217,238,.45)", ma20: "#34b7dd", ma50: "#ffc247", tagBg: "#0b2026",
};
const AXIS_R = 74, AXIS_B = 22, PAD_T = 10;

function sma(data: Candle[], n: number): (number | null)[] {
  const out: (number | null)[] = [];
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    sum += data[i].c;
    if (i >= n) sum -= data[i - n].c;
    out.push(i >= n - 1 ? sum / n : null);
  }
  return out;
}

function niceStep(span: number, target: number) {
  const raw = span / target;
  const p = 10 ** Math.floor(Math.log10(raw));
  const n = raw / p;
  return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * p;
}

const fmtTime = (t: number, tfMs: number, withDate: boolean) => {
  const d = new Date(t);
  if (tfMs >= 86_400_000) return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const hm = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  return withDate ? d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " " + hm : hm;
};

const fmtVol = (v: number) => Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(v);

export function CandleChart({ candles, pxDecimals, tfMs, lines = [], showMA = true, showVolume = true }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const view = useRef({ barW: 8, offset: 0 });          // px per candle, candles scrolled back from the right edge
  const mouse = useRef<{ x: number; y: number } | null>(null);
  const drag = useRef<{ x: number; offset: number } | null>(null);
  const raf = useRef(0);
  const data = useRef({ candles, lines, showMA, showVolume, pxDecimals, tfMs });
  data.current = { candles, lines, showMA, showVolume, pxDecimals, tfMs };

  const draw = useCallback(() => {
    raf.current = 0;
    const cv = canvas.current, el = wrap.current;
    if (!cv || !el) return;
    const { candles: cs, lines: pl, showMA: ma, showVolume: sv, pxDecimals: d, tfMs: tf } = data.current;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = el.clientWidth, H = el.clientHeight;
    if (!W || !H) return;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      cv.style.width = W + "px"; cv.style.height = H + "px";
    }
    const ctx = cv.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.font = "11px 'Geist Mono', ui-monospace, monospace";
    ctx.textBaseline = "middle";

    if (cs.length < 2) {
      ctx.fillStyle = C.text; ctx.textAlign = "center";
      ctx.fillText("Loading chart…", W / 2, H / 2);
      return;
    }

    const plotW = W - AXIS_R, plotH = H - AXIS_B;
    const v = view.current;
    const maxOffset = Math.max(0, cs.length - 10);
    v.offset = Math.max(-Math.floor(plotW / v.barW / 3), Math.min(maxOffset, v.offset));
    const visible = Math.ceil(plotW / v.barW);
    const endIdx = cs.length - 1 - Math.round(v.offset);     // index of rightmost candle
    const startIdx = Math.max(0, endIdx - visible + 1);
    const xOf = (i: number) => plotW - 4 - (endIdx - i + 0.5) * v.barW;

    let hi = -Infinity, lo = Infinity, vmax = 0;
    for (let i = startIdx; i <= Math.min(endIdx, cs.length - 1); i++) {
      const c = cs[i];
      if (c.h > hi) hi = c.h; if (c.l < lo) lo = c.l; if (c.v > vmax) vmax = c.v;
    }
    if (!Number.isFinite(hi)) { hi = cs[cs.length - 1].h; lo = cs[cs.length - 1].l; }
    const pad = (hi - lo) * 0.08 || hi * 0.002;
    hi += pad; lo -= pad;
    const priceH = sv ? plotH * 0.8 : plotH;
    const yOf = (p: number) => PAD_T + (1 - (p - lo) / (hi - lo)) * (priceH - PAD_T - 6);
    const pOf = (y: number) => lo + (1 - (y - PAD_T) / (priceH - PAD_T - 6)) * (hi - lo);

    // grid + price axis
    const step = niceStep(hi - lo, Math.max(3, Math.floor(priceH / 56)));
    ctx.strokeStyle = C.grid; ctx.lineWidth = 1; ctx.fillStyle = C.axis; ctx.textAlign = "left";
    for (let p = Math.ceil(lo / step) * step; p <= hi; p += step) {
      const y = Math.round(yOf(p)) + 0.5;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(plotW, y); ctx.stroke();
      ctx.fillText(p.toFixed(d), plotW + 8, y);
    }

    // time axis
    const labelEvery = Math.max(1, Math.ceil(90 / v.barW));
    ctx.textAlign = "center";
    let lastDay = "";
    for (let i = startIdx; i <= endIdx; i++) {
      if (i % labelEvery) continue;
      const x = Math.round(xOf(i)) + 0.5;
      ctx.strokeStyle = C.grid;
      ctx.beginPath(); ctx.moveTo(x, PAD_T); ctx.lineTo(x, plotH); ctx.stroke();
      const day = new Date(cs[i].t).toDateString();
      ctx.fillStyle = C.axis;
      ctx.fillText(fmtTime(cs[i].t, tf, day !== lastDay && tf < 86_400_000 && lastDay !== ""), x, plotH + AXIS_B / 2);
      lastDay = day;
    }
    ctx.strokeStyle = C.grid;
    ctx.beginPath(); ctx.moveTo(0, plotH + 0.5); ctx.lineTo(plotW, plotH + 0.5); ctx.moveTo(plotW + 0.5, 0); ctx.lineTo(plotW + 0.5, plotH); ctx.stroke();

    // clip to plot
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, plotW, plotH); ctx.clip();

    // volume
    if (sv && vmax > 0) {
      const vTop = priceH + 4, vH = plotH - vTop;
      for (let i = startIdx; i <= endIdx; i++) {
        const c = cs[i];
        const h = (c.v / vmax) * vH;
        ctx.fillStyle = c.c >= c.o ? "rgba(62,230,168,.28)" : "rgba(255,82,82,.28)";
        const bw = Math.max(1, v.barW * 0.7);
        ctx.fillRect(xOf(i) - bw / 2, plotH - h, bw, h);
      }
    }

    // candles
    const bw = Math.max(1, Math.floor(v.barW * 0.7));
    for (let i = startIdx; i <= endIdx; i++) {
      const c = cs[i];
      const x = Math.round(xOf(i));
      const up = c.c >= c.o;
      ctx.strokeStyle = ctx.fillStyle = up ? C.up : C.down;
      ctx.beginPath(); ctx.moveTo(x + 0.5, yOf(c.h)); ctx.lineTo(x + 0.5, yOf(c.l)); ctx.stroke();
      const y1 = yOf(Math.max(c.o, c.c)), y2 = yOf(Math.min(c.o, c.c));
      ctx.fillRect(x - Math.floor(bw / 2), y1, bw, Math.max(1, y2 - y1));
    }

    // moving averages
    if (ma) {
      for (const [n, col] of [[20, C.ma20], [50, C.ma50]] as const) {
        const m = sma(cs, n);
        ctx.strokeStyle = col; ctx.lineWidth = 1.25; ctx.beginPath();
        let started = false;
        for (let i = startIdx; i <= endIdx; i++) {
          const val = m[i];
          if (val == null) continue;
          if (!started) { ctx.moveTo(xOf(i), yOf(val)); started = true; } else ctx.lineTo(xOf(i), yOf(val));
        }
        ctx.stroke();
      }
      ctx.lineWidth = 1;
    }
    ctx.restore();

    // price lines (position entry, liq, orders) + last price
    const last = cs[cs.length - 1];
    const tag = (p: number, col: string, label: string, dashed: boolean, fg = "#04181c") => {
      const y = Math.round(yOf(p)) + 0.5;
      if (y < PAD_T || y > priceH) return;
      ctx.save();
      ctx.strokeStyle = col; ctx.setLineDash(dashed ? [4, 4] : []);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(plotW, y); ctx.stroke();
      ctx.restore();
      ctx.fillStyle = col;
      ctx.fillRect(plotW + 1, y - 9, AXIS_R - 2, 18);
      ctx.fillStyle = fg; ctx.textAlign = "left";
      ctx.fillText(p.toFixed(d), plotW + 6, y);
      if (label) {
        ctx.font = "10px 'Geist Mono', ui-monospace, monospace";
        const tw = ctx.measureText(label).width + 10;
        ctx.fillStyle = col; ctx.fillRect(plotW - tw - 6, y - 8, tw, 16);
        ctx.fillStyle = fg; ctx.fillText(label, plotW - tw - 1, y);
        ctx.font = "11px 'Geist Mono', ui-monospace, monospace";
      }
    };
    for (const l of pl) tag(l.px, l.color, l.label, l.dashed ?? true);
    tag(last.c, last.c >= last.o ? C.up : C.down, "", true);

    // crosshair + legend
    const ms = mouse.current;
    let hoverIdx = cs.length - 1;
    if (ms && ms.x < plotW && ms.y < plotH) {
      hoverIdx = Math.max(startIdx, Math.min(endIdx, Math.round(endIdx - (plotW - 4 - ms.x) / v.barW + 0.5)));
      const x = Math.round(xOf(hoverIdx)) + 0.5, y = Math.round(ms.y) + 0.5;
      ctx.save();
      ctx.strokeStyle = C.cross; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, plotH); ctx.moveTo(0, y); ctx.lineTo(plotW, y); ctx.stroke();
      ctx.restore();
      if (ms.y < priceH) {
        ctx.fillStyle = C.tagBg; ctx.fillRect(plotW + 1, y - 9, AXIS_R - 2, 18);
        ctx.fillStyle = "#fff"; ctx.textAlign = "left"; ctx.fillText(pOf(ms.y).toFixed(d), plotW + 6, y);
      }
      const tl = fmtTime(cs[hoverIdx].t, tf, true);
      ctx.font = "11px 'Geist Mono', ui-monospace, monospace";
      const tw = ctx.measureText(tl).width + 12;
      ctx.fillStyle = C.tagBg; ctx.fillRect(Math.min(plotW - tw, Math.max(0, x - tw / 2)), plotH + 1, tw, AXIS_B - 2);
      ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.fillText(tl, Math.min(plotW - tw / 2, Math.max(tw / 2, x)), plotH + AXIS_B / 2);
    }
    const hc = cs[hoverIdx];
    const chg = ((hc.c - hc.o) / hc.o) * 100;
    ctx.textAlign = "left";
    let lx = 8;
    const seg = (label: string, val: string, col: string) => {
      ctx.fillStyle = C.axis; ctx.fillText(label, lx, 16); lx += ctx.measureText(label).width + 3;
      ctx.fillStyle = col; ctx.fillText(val, lx, 16); lx += ctx.measureText(val).width + 10;
    };
    const vc = hc.c >= hc.o ? C.up : C.down;
    seg("O", hc.o.toFixed(d), vc); seg("H", hc.h.toFixed(d), vc); seg("L", hc.l.toFixed(d), vc); seg("C", hc.c.toFixed(d), vc);
    seg("", (chg >= 0 ? "+" : "") + chg.toFixed(2) + "%", vc);
    if (sv && W > 520) seg("Vol", fmtVol(hc.v), C.text);
    if (ma && W > 680) {
      const m20 = sma(cs, 20)[hoverIdx], m50 = sma(cs, 50)[hoverIdx];
      if (m20) seg("MA20", m20.toFixed(d), C.ma20);
      if (m50) seg("MA50", m50.toFixed(d), C.ma50);
    }
  }, []);

  const schedule = useCallback(() => { if (!raf.current) raf.current = requestAnimationFrame(draw); }, [draw]);

  useEffect(() => { schedule(); }, [candles, lines, showMA, showVolume, schedule]);

  useEffect(() => {
    const el = wrap.current!;
    const ro = new ResizeObserver(schedule);
    ro.observe(el);
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const v = view.current;
      const factor = e.deltaY > 0 ? 0.88 : 1.14;
      v.barW = Math.max(2, Math.min(40, v.barW * factor));
      schedule();
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => { ro.disconnect(); el.removeEventListener("wheel", onWheel); if (raf.current) cancelAnimationFrame(raf.current); };
  }, [schedule]);

  const pos = (e: React.PointerEvent) => {
    const r = wrap.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  return (
    <div
      ref={wrap}
      className="cc"
      onPointerDown={e => { (e.target as Element).setPointerCapture?.(e.pointerId); drag.current = { x: e.clientX, offset: view.current.offset }; }}
      onPointerMove={e => {
        mouse.current = pos(e);
        if (drag.current) {
          view.current.offset = drag.current.offset + (e.clientX - drag.current.x) / view.current.barW;
        }
        schedule();
      }}
      onPointerUp={() => { drag.current = null; }}
      onPointerLeave={() => { mouse.current = null; drag.current = null; schedule(); }}
      onDoubleClick={() => { view.current = { barW: 8, offset: 0 }; schedule(); }}
      role="img"
      aria-label="Price chart. Scroll to zoom, drag to pan, double-click to reset."
    >
      <canvas ref={canvas} />
    </div>
  );
}
