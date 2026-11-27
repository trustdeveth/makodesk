"use client";
import { createContext, useCallback, useContext, useRef, useState } from "react";
import { Check, Flame, Info, TriangleAlert, type LucideIcon } from "lucide-react";

type Kind = "info" | "check" | "flame" | "warn";
const ICONS: Record<Kind, LucideIcon> = { info: Info, check: Check, flame: Flame, warn: TriangleAlert };

const Ctx = createContext<(msg: string, kind?: Kind) => void>(() => {});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [t, setT] = useState<{ msg: string; kind: Kind; show: boolean }>({ msg: "", kind: "info", show: false });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toast = useCallback((msg: string, kind: Kind = "info") => {
    setT({ msg, kind, show: true });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setT(p => ({ ...p, show: false })), 2400);
  }, []);

  const Icon = ICONS[t.kind];
  return (
    <Ctx.Provider value={toast}>
      {children}
      <div className={"toast" + (t.show ? " show" : "")} role="status" aria-live="polite">
        <Icon className="ico ico-sm" />
        <span>{t.msg}</span>
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
