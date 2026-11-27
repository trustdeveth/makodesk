"use client";
import { useEffect, useState } from "react";
import { ArrowDown } from "lucide-react";
import { Fin } from "@/components/icons";
import { useConfig } from "@/components/providers/ConfigProvider";
import { useLive } from "@/components/providers/LiveProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { useWallet } from "@/components/app/WalletProvider";
import { fmt } from "@/lib/format";

interface Quote { amountOut: number; minOut: number; priceImpactPct: number; rate: number; usdIn: number }

const HypeChip = () => (
  <span className="tok-chip"><span className="ic" style={{ background: "#0f2a30", color: "var(--cyan-pale)" }}>H</span>HYPE</span>
);
const MakoChip = () => (
  <span className="tok-chip"><span className="ic" style={{ background: "var(--cyan)", color: "var(--on-cyan)" }}><Fin width={16} height={16} /></span>MAKO</span>
);

export default function SwapPage() {
  const cfg = useConfig();
  const s = useLive();
  const w = useWallet();
  const toast = useToast();
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amt, setAmt] = useState("");
  const [slip, setSlip] = useState(1);
  const [quote, setQuote] = useState<Quote | null>(null);

  const x = parseFloat(amt) || 0;

  // server-side quote, debounced
  useEffect(() => {
    if (!x || !cfg.contracts.token) { setQuote(null); return; }
    const ctl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/quote?side=${side}&amount=${x}&slippage=${slip}`, { signal: ctl.signal, cache: "no-store" })
        .then(r => (r.ok ? r.json() : null)).then(q => setQuote(q)).catch(() => {});
    }, 250);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [x, side, slip, cfg.contracts.token]);

  const balIn = side === "buy" ? w.hype : w.mako;
  const balOut = side === "buy" ? w.mako : w.hype;
  const showBal = (v: number | null, d: number) => (v == null ? "—" : fmt.num(v, d));
  const err = (e: unknown) => toast(((e as Error)?.message || "Rejected").slice(0, 90), "warn");

  let label = "Connect wallet", disabled = false, action: () => void = () => w.connect().catch(err);
  if (w.address && !w.onElysium) { label = "Switch to Elysium"; action = () => w.ensureNetwork().catch(err); }
  else if (w.address && !cfg.contracts.token) { label = "Trading opens at launch"; disabled = true; }
  else if (w.address && !x) { label = "Enter an amount"; disabled = true; }
  else if (w.address && balIn != null && x > balIn) { label = "Insufficient balance"; disabled = true; }
  else if (w.address) {
    label = side === "buy" ? "Buy $MAKO" : "Sell $MAKO";
    action = () => (cfg.links.swap ? window.open(cfg.links.swap, "_blank", "noopener") : toast("Set MAKO_SWAP_URL in .env to the official pool", "info"));
  }

  const steps = [
    { done: !!w.address, h: "Connect a wallet", p: "Any EVM wallet: Rabby, MetaMask, OKX Wallet", btn: "Connect", run: () => w.connect().catch(err) },
    { done: w.onElysium, h: "Add the Elysium network", p: "One click. Gas is paid in HYPE.", btn: "Add network", run: () => w.ensureNetwork().catch(err) },
    { done: false, h: "Bridge HYPE to Elysium", p: "Native bridge, or instant via Relay / Jumper", btn: "Bridge", run: () => (cfg.links.bridge ? window.open(cfg.links.bridge, "_blank", "noopener") : (location.href = "/docs#bridge")) },
    { done: false, h: "Add $MAKO to your wallet", p: "Track your balance natively", btn: "Add token", run: () => w.watchToken().catch(err) },
  ];

  return (
    <section className="view active">
      <div className="swap-wrap">
        <div className="panel swap">
          <div className="row between" style={{ marginBottom: 14 }}>
            <h3 style={{ fontSize: 18 }}>Swap</h3>
            <div className="slip">
              <span className="muted" style={{ fontSize: 12, marginRight: 4 }}>Slippage</span>
              {[0.5, 1, 3].map(v => <button key={v} className={slip === v ? "on" : ""} onClick={() => setSlip(v)}>{v}%</button>)}
            </div>
          </div>
          <div className="box">
            <div className="top"><span>You pay</span><span>Balance: <span className="mono">{showBal(balIn, side === "buy" ? 4 : 0)}</span>
              <button className="max" onClick={() => (balIn == null ? toast("Connect on Elysium to load balance") : setAmt(String(side === "buy" ? Math.max(0, balIn - 0.001).toFixed(4) : balIn)))}>MAX</button></span></div>
            <div className="mid">
              <input inputMode="decimal" placeholder="0.0" autoComplete="off" aria-label="Amount to pay" value={amt}
                onChange={e => setAmt(e.target.value.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1"))} />
              {side === "buy" ? <HypeChip /> : <MakoChip />}
            </div>
            <div className="top" style={{ marginTop: 6 }}><span>{fmt.usd(quote?.usdIn ?? 0)}</span><span /></div>
          </div>
          <button className="flip" aria-label="Flip direction" onClick={() => { setSide(p => (p === "buy" ? "sell" : "buy")); setAmt(""); }}>
            <ArrowDown className="ico ico-sm" />
          </button>
          <div className="box">
            <div className="top"><span>You receive</span><span>Balance: <span className="mono">{showBal(balOut, side === "buy" ? 0 : 4)}</span></span></div>
            <div className="mid">
              <input placeholder="0.0" readOnly aria-label="Estimated amount received" value={quote ? (side === "buy" ? fmt.num(quote.amountOut, 0) : fmt.num(quote.amountOut, 6)) : ""} />
              {side === "buy" ? <MakoChip /> : <HypeChip />}
            </div>
            <div className="top" style={{ marginTop: 6 }}><span>{fmt.usd((quote?.usdIn ?? 0) * (1 - (quote?.priceImpactPct ?? 0) / 100))}</span><span /></div>
          </div>
          <div className="route">
            <div><span>Rate</span><span>{s?.live?.token && s.makoPrice > 0 ? `1 HYPE = ${fmt.num(s.mid / s.makoPrice, 0)} MAKO` : "At launch"}</span></div>
            <div><span>Min. received</span><span>{quote ? (side === "buy" ? fmt.num(quote.minOut, 0) + " MAKO" : fmt.num(quote.minOut, 6) + " HYPE") : "—"}</span></div>
            <div><span>Price impact</span><span className={quote && quote.priceImpactPct > 3 ? "down" : ""}>{quote ? quote.priceImpactPct.toFixed(2) + "%" : "—"}</span></div>
            <div><span>Network fee</span><span>~0.00002 HYPE</span></div>
          </div>
          <button className="btn btn-primary btn-lg btn-block" disabled={disabled} onClick={action}>{label}</button>
          <p className="muted" style={{ fontSize: 12, marginTop: 10, textAlign: "center" }}>Swaps route through the official $MAKO/HYPE pool. The quote shown is an estimate.</p>
        </div>

        <div className="panel">
          <div className="panel-h"><h3>Get started on Elysium</h3></div>
          <div className="panel-b">
            <ol className="steps-list">
              {steps.map(st => (
                <li key={st.h} className={st.done ? "done" : ""}>
                  <div><b>{st.h}</b><small>{st.p}</small></div>
                  <button className="btn btn-sm" onClick={st.run}>{st.btn}</button>
                </li>
              ))}
            </ol>
            <hr className="hr" style={{ margin: "18px 0" }} />
            <div className="params">
              <div><span>Official contract</span><span>{cfg.contracts.token ? fmt.short(cfg.contracts.token) : "Published at launch"}</span></div>
              <div><span>Pool</span><span>MAKO / HYPE</span></div>
              <div><span>LP</span><span className={cfg.contracts.lp ? "up" : ""}>{cfg.contracts.lp ? "Locked" : "Locked at launch"}</span></div>
              <div><span>Tax</span><span>0% / 0%</span></div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
