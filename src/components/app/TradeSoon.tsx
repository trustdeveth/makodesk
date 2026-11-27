"use client";
import Link from "next/link";
import { ArrowRight, Lock, Wallet } from "lucide-react";
import type { MarketSpec } from "@/lib/markets";
import type { MarketState } from "@/lib/types";
import { useWallet } from "@/components/app/WalletProvider";
import { useToast } from "@/components/providers/ToastProvider";

/** Order-entry panel until on-chain trading opens. Shows the live best bid/ask and the path to buy $MAKO. */
export function TradeSoon({ m, spec }: { m: MarketState | undefined; spec: MarketSpec }) {
  const w = useWallet();
  const toast = useToast();
  const bid = m?.book.bids[0]?.px, ask = m?.book.asks[0]?.px;
  return (
    <div className="t-soon">
      <div className="t-soon-q">
        <div className="q bid"><small>Best bid</small><b className="mono">{bid != null ? bid.toFixed(spec.pxDecimals) : "—"}</b></div>
        <div className="q ask"><small>Best ask</small><b className="mono">{ask != null ? ask.toFixed(spec.pxDecimals) : "—"}</b></div>
      </div>
      <div className="t-soon-card">
        <span className="t-soon-ic"><Lock className="ico" /></span>
        <h4>Trading opens at deploy</h4>
        <p>Orders will route to HyperCore through your own trade-only agent once ElysiumCoreWriter is live. Your funds never leave your account.</p>
      </div>
      {w.address
        ? <Link className="btn btn-primary btn-block" href="/app/swap">Get ready to buy $MAKO <ArrowRight className="ico ico-sm" /></Link>
        : <button className="btn btn-primary btn-block" onClick={() => w.connect().catch(e => toast(((e as Error)?.message || "Rejected").slice(0, 90), "warn"))}><Wallet className="ico ico-sm" />Connect wallet</button>}
      <Link className="btn btn-ghost btn-block" href="/docs#roadmap">See the roadmap</Link>
    </div>
  );
}

export function AccountSoon() {
  const w = useWallet();
  return (
    <div className="t-acc-soon">
      <b>{w.address ? "No positions yet" : "Connect a wallet to see your positions"}</b>
      <span>Positions, open orders and trade history appear here once on-chain trading opens.</span>
    </div>
  );
}
