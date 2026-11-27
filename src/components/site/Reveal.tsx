"use client";
import { useEffect } from "react";

/**
 * Adds `.in` to each `.reveal` element once its top edge enters the viewport.
 * Uses a cheap rAF-throttled scroll check (works everywhere, no observer quirks).
 */
export function RevealObserver() {
  useEffect(() => {
    let pending = false;
    const check = () => {
      pending = false;
      const limit = window.innerHeight * 0.92;
      document.querySelectorAll<HTMLElement>(".reveal:not(.in)").forEach(el => {
        if (el.getBoundingClientRect().top < limit) el.classList.add("in");
      });
    };
    const onScroll = () => { if (!pending) { pending = true; requestAnimationFrame(check); } };
    check();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => { window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); };
  }, []);
  return null;
}
