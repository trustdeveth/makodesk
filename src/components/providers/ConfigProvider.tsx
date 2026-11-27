"use client";
import { createContext, useContext } from "react";
import type { PublicConfig } from "@/lib/types";

const Ctx = createContext<PublicConfig | null>(null);

export function ConfigProvider({ value, children }: { value: PublicConfig; children: React.ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useConfig(): PublicConfig {
  const v = useContext(Ctx);
  if (!v) throw new Error("useConfig must be used inside ConfigProvider");
  return v;
}
