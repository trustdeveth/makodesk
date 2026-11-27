"use client";
import { useEffect, useRef } from "react";
import { useLive } from "@/components/providers/LiveProvider";
import { fmt } from "@/lib/format";

type P = { x: number; y: number; z: number; kind: 0 | 1; d?: number };

function buildPoints(): P[] {
  const pts: P[] = [];
  const xL = (y: number) => 0.72 * Math.pow(y, 1.7);          // leading edge, swept back
  const xT = (y: number) => 1.0 - 0.28 * Math.pow(y, 0.45);   // trailing edge, concave notch
  const ROWS = 44;
  for (let r = 0; r <= ROWS; r++) {
    const y = r / ROWS;
    const a = xL(y), b = xT(y);
    const chord = Math.max(0, b - a);
    const cols = Math.max(1, Math.round(chord * 46));
    for (let c = 0; c <= cols; c++) {
      const u = c / cols;
      const th = 0.11 * (1 - y * 0.9) * Math.pow(Math.sin(Math.PI * u), 0.55);
      pts.push({ x: a + chord * u - 0.55, y: y * 1.05, z: th, kind: 1 });
      pts.push({ x: a + chord * u - 0.55, y: y * 1.05, z: -th, kind: 1 });
    }
  }
  for (let i = -26; i <= 26; i++) {
    for (let j = -16; j <= 16; j++) {
      const x = i * 0.05, z = j * 0.05, d = Math.hypot(x, z);
      if (d <= 1.3) pts.push({ x, y: 0, z, kind: 0, d });
    }
  }
  return pts;
}

/** Halftone dot shark fin — 3D point cloud, perspective projection, depth shading. */
export function FinCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);
  const live = useLive();

  useEffect(() => {
    const canvas = ref.current!;
    const pts = buildPoints();
    let t = 0, raf = 0;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    const draw = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return;
      if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
      const ctx = canvas.getContext("2d")!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const rot = Math.sin(t * 0.35) * 0.75 + 0.35, tilt = 0.32;
      const cr = Math.cos(rot), sr = Math.sin(rot), ct = Math.cos(tilt), st = Math.sin(tilt);
      const scale = Math.min(w, h) * 0.66, cx = w * 0.5, cy = h * 0.74;
      const bob = Math.sin(t * 1.2) * 0.015;

      const proj = pts.map(p => {
        let y = p.y;
        if (p.kind === 0) y = Math.sin(p.d! * 9 - t * 2.2) * 0.018 * (1.3 - p.d!);
        else y += bob;
        const x1 = p.x * cr + p.z * sr;
        const z1 = -p.x * sr + p.z * cr;
        const y2 = y * ct - z1 * st;
        const z2 = y * st + z1 * ct;
        const persp = 2.6 / (2.6 + z2);
        return { sx: cx + x1 * scale * persp, sy: cy - y2 * scale * persp, z: z2, p, persp };
      }).sort((a, b) => b.z - a.z);

      for (const q of proj) {
        const depth = Math.max(0, Math.min(1, (1.2 - q.z) / 2.2));
        if (q.p.kind === 0) {
          const fade = Math.max(0, 1 - q.p.d! / 1.3);
          ctx.fillStyle = `rgba(52,183,221,${(0.12 + 0.5 * fade * depth).toFixed(3)})`;
          const r = 1.1 + 1.3 * fade * q.persp;
          ctx.fillRect(q.sx - r / 2, q.sy - r / 2, r, r);
        } else {
          const facing = (q.p.z >= 0 ? 1 : -1) * Math.cos(rot - 0.5);
          const light = 0.45 + 0.5 * Math.max(0, facing) + q.p.y * 0.25;
          const r = (1.4 + 2.1 * light) * q.persp;
          const c = light > 0.75 ? "255,255,255" : light > 0.55 ? "219,242,249" : "111,205,232";
          ctx.fillStyle = `rgba(${c},${(0.35 + 0.65 * depth).toFixed(3)})`;
          ctx.beginPath(); ctx.arc(q.sx, q.sy, r / 2, 0, Math.PI * 2); ctx.fill();
        }
      }
    };

    const loop = () => { t += 0.016; draw(); if (!reduce) raf = requestAnimationFrame(loop); };
    loop();
    window.addEventListener("resize", draw);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", draw); };
  }, []);

  return (
    <div className="fin-stage" aria-hidden="true">
      <canvas ref={ref} />
      <span className="fin-tag a">$MAKO {live ? fmt.usd(live.makoPrice, 6) : ""}</span>
      <span className="fin-tag b">mood: {live ? live.mood.label.toLowerCase() : "…"}</span>
    </div>
  );
}
