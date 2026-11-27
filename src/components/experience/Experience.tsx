"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import Lenis from "lenis";
import "lenis/dist/lenis.css";
import { ArrowRight } from "lucide-react";
import { useLive } from "@/components/providers/LiveProvider";
import { useConfig } from "@/components/providers/ConfigProvider";
import { XLogo } from "@/components/icons";
import { fmt } from "@/lib/format";
import { OceanAudio } from "./audio";
import { Gate } from "./Gate";
import type { OceanScene } from "./scene";

const CHAPTERS = [
  { c: 0.02, n: "", eyebrow: "Mako Desk · Native to Elysium", title: ["The memecoin", "that makes markets"], body: "" },
  { c: 0.3, n: "01 / 03", eyebrow: "Sense", title: ["It reads", "the book."], body: "Hyperliquid order books, funding and liquidations, read natively on Elysium at HyperCore block speed. No oracle in the loop." },
  { c: 0.5, n: "02 / 03", eyebrow: "Quote", title: ["It makes", "the market."], body: "Resting bids and asks on HyperCore in about 100 ms, through a trade-only agent that can never withdraw." },
  { c: 0.7, n: "03 / 03", eyebrow: "Burn", title: ["It burns", "the profit."], body: "80% of realized desk profit buys $MAKO on the open market and sends it to the burn address. Supply only goes down." },
  { c: 0.93, n: "", eyebrow: "$MAKO", title: ["Follow", "the fin."], body: "" },
];
const WINDOW = 0.085;

function SoundWave({ on }: { on: boolean }) {
  return (
    <svg className={"xp-wave" + (on ? " on" : "")} viewBox="0 0 28 12" aria-hidden="true">
      <path d="M1 6 Q4.5 1 8 6 T15 6 T22 6 T27 6" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

export function Experience({ children }: { children: React.ReactNode }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<OceanScene | null>(null);
  const lenisRef = useRef<Lenis | null>(null);
  const audioRef = useRef<OceanAudio | null>(null);
  const [gate, setGate] = useState<"loading" | "ready" | "open">("loading");
  const [showGate, setShowGate] = useState(true);
  const [loadPct, setLoadPct] = useState(0);
  const [sound, setSound] = useState(false);
  const [p, setP] = useState(0);
  const [pagePct, setPagePct] = useState(0);
  const [webgl, setWebgl] = useState(true);
  const s = useLive();
  const cfg = useConfig();

  // skip the gate if already entered this session
  useEffect(() => {
    try { if (sessionStorage.getItem("mako-entered")) { setGate("open"); setShowGate(false); } } catch { /* storage blocked */ }
  }, []);

  // boot three.js scene (dynamic import keeps it out of the initial bundle)
  useEffect(() => {
    let disposed = false;
    let fake = 0;
    const started = performance.now();
    const MIN_MS = 2800;
    const timer = setInterval(() => { fake = Math.min(92, fake + 2.2 + Math.random() * 3.2); setLoadPct(Math.round(fake)); }, 90);
    (async () => {
      try {
        const { OceanScene } = await import("./scene");
        if (disposed || !canvasRef.current) return;
        sceneRef.current = new OceanScene(canvasRef.current);
      } catch {
        setWebgl(false);
      }
      const wait = Math.max(0, MIN_MS - (performance.now() - started));
      setTimeout(() => {
        clearInterval(timer);
        setLoadPct(100);
        setTimeout(() => setGate(g => (g === "loading" ? "ready" : g)), 450);
      }, wait);
    })();
    const onResize = () => sceneRef.current?.resize();
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      sceneRef.current?.setPointer((e.clientX / window.innerWidth) * 2 - 1, -((e.clientY / window.innerHeight) * 2 - 1));
    };
    const onOut = () => sceneRef.current?.setPointerOut();
    const onVis = () => sceneRef.current?.setRunning(!document.hidden);
    window.addEventListener("resize", onResize);
    window.addEventListener("pointermove", onMove);
    document.documentElement.addEventListener("pointerleave", onOut);
    window.addEventListener("blur", onOut);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      disposed = true; clearInterval(timer);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onOut);
      window.removeEventListener("blur", onOut);
      document.removeEventListener("visibilitychange", onVis);
      sceneRef.current?.dispose(); sceneRef.current = null;
      audioRef.current?.dispose(); audioRef.current = null;
    };
  }, []);

  // scroll -> progress
  useEffect(() => {
    const onScroll = () => {
      const tr = trackRef.current;
      if (!tr) return;
      const max = tr.offsetHeight - window.innerHeight;
      const prog = Math.min(1, Math.max(0, window.scrollY / Math.max(1, max)));
      setP(prog);
      sceneRef.current?.setProgress(prog);
      const doc = document.documentElement.scrollHeight - window.innerHeight;
      setPagePct(Math.min(1, window.scrollY / Math.max(1, doc)));
      // dim the scene once content scrolls over it
      const past = Math.min(1, Math.max(0, (window.scrollY - max) / window.innerHeight));
      document.documentElement.style.setProperty("--xp-dim", String(past));
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // smooth, inertial wheel scrolling so the scene scrubs continuously with the wheel
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const lenis = new Lenis({ lerp: 0.07, wheelMultiplier: 0.75, touchMultiplier: 1.1, smoothWheel: true });
    lenisRef.current = lenis;
    let raf = 0;
    const loop = (t: number) => { lenis.raf(t); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); lenis.destroy(); lenisRef.current = null; };
  }, []);

  // lock scroll while the gate is up
  useEffect(() => {
    document.documentElement.style.overflow = gate === "open" ? "" : "hidden";
    if (gate === "open") lenisRef.current?.start(); else lenisRef.current?.stop();
    return () => { document.documentElement.style.overflow = ""; };
  }, [gate]);

  const enter = useCallback((withSound: boolean) => {
    if (withSound) {
      audioRef.current ??= new OceanAudio();
      audioRef.current.start();
      setSound(true);
    }
    try { sessionStorage.setItem("mako-entered", "1"); } catch { /* storage blocked */ }
    setGate("open");
  }, []);

  const toggleSound = () => {
    if (!audioRef.current) { audioRef.current = new OceanAudio(); audioRef.current.start(); setSound(true); return; }
    audioRef.current.setOn(!sound);
    setSound(!sound);
  };

  const ss = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const weights = CHAPTERS.map((ch, i) =>
    i === 0 ? 1 - ss(0.05, 0.1, p)
    : i === CHAPTERS.length - 1 ? ss(ch.c - 0.1, ch.c - 0.04, p)
    : 1 - ss(WINDOW * 0.35, WINDOW, Math.abs(p - ch.c)));
  const active = weights.findIndex(w => w > 0.45);
  const inTrack = p < 0.999;

  return (
    <div className="xp">
      <canvas ref={canvasRef} className={"xp-canvas" + (webgl ? "" : " off")} aria-hidden="true" />
      <div className="xp-dim" aria-hidden="true" />

      {/* Intro gate */}
      {showGate && <Gate ready={gate !== "loading"} progress={loadPct} onEnter={enter} />}

      {/* Header */}
      <header className={"xp-head" + (inTrack ? "" : " solid")}>
        <Link href="/" className="xp-brand" aria-label="Mako Desk home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="" />
          <span>Mako<br />Desk</span>
        </Link>
        <nav className="xp-nav">
          <Link href="/app">App</Link>
          <Link href="/docs">Docs</Link>
          <Link href="/#token">Token</Link>
        </nav>
        <div className="xp-head-r">
          <a className="xp-x" href={cfg.brand.xUrl} target="_blank" rel="noopener" aria-label={"Mako Desk on X (@" + cfg.brand.x + ")"}><XLogo /></a>
          <button className="xp-sound" onClick={toggleSound} aria-pressed={sound}>Sound {sound ? "on" : "off"} <SoundWave on={sound} /></button>
          <Link className="xp-hbtn primary sm" href="/app"><span>Launch app</span></Link>
        </div>
      </header>

      {/* Chapters (fixed over the scene while inside the scroll track) */}
      <div className={"xp-chapters" + (inTrack ? "" : " gone")} aria-live="polite">
        {CHAPTERS.map((ch, i) => (
          <div key={i} className={"xp-ch" + (i === 0 ? " first" : "") + (i === CHAPTERS.length - 1 ? " last" : "") + (active === i ? " on" : "")} style={{ ["--w" as string]: weights[i].toFixed(3) }}>
            {ch.n && <span className="xp-n">{ch.n}</span>}
            <span className="xp-eyebrow">{ch.eyebrow}</span>
            <h2 className="xp-title">
              {ch.title.map((line, j) => <span key={j} className={"ln" + (j === ch.title.length - 1 ? " hl" : "")}><i style={{ transitionDelay: (j * 90) + "ms" }}>{line}</i></span>)}
            </h2>
            {ch.body && <p className="xp-body">{ch.body}</p>}
            {i === CHAPTERS.length - 1 && (
              <div className="xp-ctas">
                <Link className="xp-hbtn primary" href="/app"><span>Launch app</span><ArrowRight className="ico ico-sm" /></Link>
                <Link className="xp-hbtn" href="/docs"><span>Read the docs</span></Link>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Scroll hint / live HUD */}
      <div className={"xp-hud" + (inTrack ? "" : " gone")}>
        {p < 0.04 ? (
          <span className="xp-hint">Scroll down<br />to discover more</span>
        ) : (
          <div className="xp-live">
            <span>HYPE-PERP <b>{s ? s.mid.toFixed(3) : "—"}</b></span>
            <span>Funding <b>{s ? (s.funding * 100).toFixed(4) + "%" : "—"}</b></span>
            <span>Mood <b style={{ color: s?.mood.color }}>{s?.mood.label ?? "—"}</b></span>
            <span>Wick <b>{s ? (s.wick?.armed ? "Armed" : "Watching") : "—"}</b></span>
          </div>
        )}
      </div>

      {/* Progress rail */}
      <div className="xp-rail" aria-hidden="true"><i style={{ transform: `translateY(${pagePct * 128}px)` }} /></div>

      <div ref={trackRef} className="xp-track" />
      <div className="xp-content">{children}</div>
    </div>
  );
}
