"use client";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { DeskState } from "@/lib/types";

/**
 * One SSE connection per tab, shared by every component.
 * Falls back to polling /api/desk/state if EventSource fails repeatedly.
 */
const Ctx = createContext<DeskState | null>(null);

export function LiveProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<DeskState | null>(null);
  const fails = useRef(0);

  useEffect(() => {
    let es: EventSource | null = null;
    let poll: ReturnType<typeof setInterval> | null = null;
    let closed = false;

    const startPolling = () => {
      if (poll) return;
      poll = setInterval(async () => {
        try {
          const r = await fetch("/api/desk/state", { cache: "no-store" });
          if (r.ok) setState(await r.json());
        } catch { /* keep trying */ }
      }, 1500);
    };

    const connect = () => {
      if (closed) return;
      es = new EventSource("/api/desk/stream");
      es.onmessage = e => {
        fails.current = 0;
        try { setState(JSON.parse(e.data)); } catch { /* ignore malformed frame */ }
      };
      es.onerror = () => {
        fails.current++;
        if (fails.current >= 4) { es?.close(); startPolling(); }
      };
    };
    connect();

    return () => { closed = true; es?.close(); if (poll) clearInterval(poll); };
  }, []);

  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}

/** Latest desk state, or null until the first frame arrives. */
export function useLive(): DeskState | null {
  return useContext(Ctx);
}
