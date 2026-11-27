"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLive } from "@/components/providers/LiveProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { useWallet } from "@/components/app/WalletProvider";
import type { MarketSymbol } from "@/lib/types";
import { type Account, type OrderInput, cancel, cancelAll, loadAccount, newAccount, place, saveAccount, tick } from "./paper";

/**
 * Paper account bound to the live stream. Persisted per wallet (or "local")
 * in localStorage; resting orders are matched on every frame.
 */
export function usePaper() {
  const s = useLive();
  const toast = useToast();
  const { address } = useWallet();
  const owner = address?.toLowerCase() ?? "local";
  const [acc, setAcc] = useState<Account>(newAccount);
  const ref = useRef(acc);
  const ownerRef = useRef(owner);

  const commit = useCallback((a: Account) => {
    ref.current = a;
    setAcc(a);
    saveAccount(ownerRef.current, a);
  }, []);

  // load on mount and when the wallet changes
  useEffect(() => {
    ownerRef.current = owner;
    const a = loadAccount(owner);
    ref.current = a;
    setAcc(a);
  }, [owner]);

  // keep tabs in sync
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === `mako.paper.v1:${ownerRef.current}`) { const a = loadAccount(ownerRef.current); ref.current = a; setAcc(a); }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // match resting orders + liquidations on each frame
  useEffect(() => {
    if (!s?.markets?.length) return;
    const cur = ref.current;
    if (!cur.open.length && !Object.keys(cur.perps).length) return;
    const { a, events } = tick(cur, s.markets);
    if (a !== cur) commit(a);
    for (const e of events) toast(e.text, e.kind === "fill" ? "check" : "warn");
  }, [s, commit, toast]);

  const submit = useCallback((i: OrderInput): string | null => {
    const m = s?.markets.find(x => x.symbol === i.market);
    if (!m) return "Market data not loaded yet";
    const r = place(ref.current, i, m);
    if (!r.ok) return r.error;
    commit(r.a);
    const o = r.order;
    if (o.status === "filled") toast(`${o.side === "buy" ? "Bought" : "Sold"} ${o.filled.toLocaleString("en-US", { maximumFractionDigits: 4 })} ${o.market.split("-")[0]} @ ${o.avgPx.toPrecision(6)}${o.reason ? " (partial)" : ""}`, "check");
    else toast(`Limit ${o.side} placed${o.filled ? ` (${o.filled} filled now)` : ""}`, "check");
    return null;
  }, [s, commit, toast]);

  return {
    acc,
    submit,
    cancel: useCallback((id: string) => commit(cancel(ref.current, id)), [commit]),
    cancelAll: useCallback((m?: MarketSymbol) => commit(cancelAll(ref.current, m)), [commit]),
    reset: useCallback(() => commit(newAccount()), [commit]),
  };
}
