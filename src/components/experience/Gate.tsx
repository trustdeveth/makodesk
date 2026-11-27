"use client";
import { useEffect, useState } from "react";

/** Logo mark as thin outline strokes (same geometry as /logo.svg, 64-unit space). */
function MarkOutline({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <rect className="ln l1" x="1" y="1" width="62" height="62" rx="14" pathLength={100} />
      <path className="ln l2" d="M14 46 C24 44 31 32 33 12 C40 24 46 36 52 46 Z" pathLength={100} />
      <path className="ln l3" d="M8 50.5 Q16 47 24 50.5 T40 50.5 T56 50.5" pathLength={100} />
    </svg>
  );
}

/** Word rises out of a mask, letters lightly staggered (calm, no flicker). */
function FlickerWord({ text, run, lineDelay = 0 }: { text: string; run: boolean; lineDelay?: number }) {
  return (
    <span className="xp-flick" aria-label={text}>
      {text.split("").map((ch, i) => (
        <span key={i} aria-hidden="true" className={run ? "on" : ""} style={{ transitionDelay: (lineDelay + i * 45) + "ms" }}>{ch}</span>
      ))}
    </span>
  );
}

export function Gate({ ready, progress, onEnter }: { ready: boolean; progress: number; onEnter: (sound: boolean) => void }) {
  const [mounted, setMounted] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [gone, setGone] = useState(false);

  useEffect(() => { const t = requestAnimationFrame(() => setMounted(true)); return () => cancelAnimationFrame(t); }, []);

  const go = (sound: boolean) => {
    if (leaving) return;
    setLeaving(true);
    onEnter(sound);
    setTimeout(() => setGone(true), 1100);
  };

  if (gone) return null;
  const state = leaving ? "leave" : ready ? "ready" : "load";

  return (
    <div className={`xp-gate ${state}${mounted ? " in" : ""}`} role="dialog" aria-label="Enter Mako Desk">
      <div className="xp-gate-mark"><MarkOutline /></div>

      <div className="xp-gate-center">
        <div className="xp-gate-word">
          <FlickerWord text="MAKO" run={mounted} />
          <FlickerWord text="DESK" run={mounted} lineDelay={140} />
        </div>

        <div className="xp-gate-slot">
          <div className="xp-gate-loading" aria-hidden={ready}>
            <span>Loading</span>
            <svg viewBox="0 0 120 2" preserveAspectRatio="none" className="xp-gate-bar">
              <defs>
                <linearGradient id="xpBarGrad" x1="0" x2="1"><stop offset="0" stopColor="#2d7388" /><stop offset="1" stopColor="#93d9ee" /></linearGradient>
              </defs>
              <line x1="0" y1="1" x2="120" y2="1" className="bg" />
              <line x1="0" y1="1" x2="120" y2="1" className="fg" style={{ transform: `scaleX(${progress / 100})` }} />
            </svg>
          </div>

          <button className="xp-gbtn" onClick={() => go(true)} tabIndex={ready ? 0 : -1} aria-hidden={!ready}>
            <svg className="xp-gbtn-border" aria-hidden="true">
              <defs>
                <linearGradient id="xpBtnGrad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="#93d9ee" /><stop offset=".5" stopColor="#34b7dd" /><stop offset="1" stopColor="#2d7388" />
                </linearGradient>
              </defs>
              <rect pathLength={100} rx="6" ry="6" />
            </svg>
            <span className="xp-gbtn-fill" aria-hidden="true" />
            <span className="xp-gbtn-label">Enter with sound</span>
          </button>
        </div>
      </div>

      <div className="xp-gate-foot">
        <button className="xp-glink" onClick={() => go(false)} tabIndex={ready ? 0 : -1} aria-hidden={!ready}>Enter without sound</button>
        <p>This experience includes generated ocean ambience.<br />Sound is optional and can be toggled at any time.</p>
      </div>
    </div>
  );
}
