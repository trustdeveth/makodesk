import Link from "next/link";
import { ArrowRight, ArrowUpRight, Check, Eye, Lock, Plus, Send, ShieldCheck } from "lucide-react";
import { getConfig } from "@/lib/config";
import { SiteFooter } from "@/components/site/SiteFooter";
import { RevealObserver } from "@/components/site/Reveal";
import { CopyButton } from "@/components/site/CopyButton";
import { XLogo } from "@/components/icons";
import { Experience } from "@/components/experience/Experience";
import { TickerBand } from "@/components/landing/TickerBand";
import { DeskWidget } from "@/components/landing/DeskWidget";
import { CodeCard } from "@/components/landing/CodeCard";

const ROAD = [
  { ph: "PHASE 01", h: "Surface", dep: "Elysium mainnet · live", now: true, items: ["Fair launch, LP locked", "Explorer verification", "App in preview mode"] },
  { ph: "PHASE 02", h: "Sense", dep: "Market-data precompile", items: ["Live Mood Engine", "Wick detector", "Real-time dashboard"] },
  { ph: "PHASE 03", h: "Strike", dep: "ElysiumCoreWriter stable", items: ["Desk quoting under caps", "MakoDesk audit", "Buyback and burn loop"] },
  { ph: "PHASE 04", h: "Apex", dep: "Public track record", items: ["HyperCore spot listing", "Higher caps", "Multi-market desk"] },
];

const FAQ = [
  ["Is the desk trading right now?", "Not yet. The live desk needs Elysium's Phase 2 upgrade, which adds the HyperCore precompile and ElysiumCoreWriter. Until then the app shows a clearly labelled preview. The token and liquidity are live from launch."],
  ["Why Elysium?", "Elysium is an EVM L2 for Hyperliquid with 100 ms blocks, HYPE as gas and, from Phase 2, native read and write access to HyperCore order books. A contract that makes markets on Hyperliquid isn't practical on any other chain."],
  ["Can the team take the treasury?", "No. The trading agent can't withdraw, the 20% desk allocation is held by the contract, and parameters only change through a public 48-hour timelock."],
  ["What if the desk loses money?", "Losses are capped per day and overall. When a limit is hit, quoting pauses automatically and the event is public. Burns only come from realized profit, never from principal."],
  ["How do I buy $MAKO?", "Bridge HYPE to Elysium, open the app, connect your wallet and swap. The official contract address is posted only on makodesk.xyz and @makodesk."],
];

export default function Home() {
  const cfg = getConfig();
  const ca = cfg.contracts.token;

  return (
    <>
      <Experience>
      <main>
        <TickerBand />

        {/* WIDGET */}
        <section className="sec" id="desk">
          <div className="container">
            <div className="sec-head reveal">
              <h2 className="h2">Two ways to watch.<span className="sub">The book, or the shark.</span></h2>
            </div>
            <DeskWidget />
          </div>
        </section>

        {/* INTEGRATE */}
        <section className="sec" style={{ paddingTop: 0 }}>
          <div className="container split">
            <div className="reveal">
              <h2 className="h2">Plug into the desk.<span className="sub">Read it from any contract.</span></h2>
              <p className="lead">Mood, PnL, inventory and burns are public on-chain state. Build bots, dashboards or your own memes on top of the shark.</p>
              <Link className="btn btn-outline" href="/docs#integration">Read the integration docs <ArrowRight className="ico ico-sm" /></Link>
            </div>
            <CodeCard />
          </div>
        </section>

        {/* TOKEN (heavy cyan) */}
        <section className="sec cyan-block" id="token">
          <div className="container">
            <h2 className="h2 reveal">Simple. Fair. Built to shrink.<span className="sub">Fixed supply. No mint. No tax. No team bag.</span></h2>
            <div className="stats4 reveal">
              <div><b>1B</b><span>Fixed supply</span><small>No mint function, ever</small></div>
              <div><b>0%</b><span>Buy / sell tax</span><small>The desk earns from markets, not holders</small></div>
              <div><b>0%</b><span>Team allocation</span><small>Team buys at launch like everyone</small></div>
              <div><b>{cfg.tokenomics.burnShare}%</b><span>Of profit burned</span><small>Every epoch, from realized PnL</small></div>
            </div>
            <div className="allocbar reveal">
              <div className="a1">70% <span>&nbsp;Fair-launch liquidity</span></div>
              <div className="a2">20% <span>&nbsp;Desk</span></div>
              <div className="a3">10%</div>
            </div>
            <div className="alloclegend">
              <span><b>70% Fair-launch liquidity</b>: paired with HYPE, LP locked</span>
              <span><b>20% Desk treasury</b>: held by contract</span>
              <span><b>10% Community</b>: 12-month unlock</span>
            </div>
            <div className="ca-row">
              <div className="ca-chip">
                <span>{ca ? "CA: " + ca : "CA: published at launch on @makodesk"}</span>
                <CopyButton text={ca} />
              </div>
              <Link className="btn btn-dark btn-lg" href="/app/swap">Buy $MAKO <ArrowRight className="ico ico-sm" /></Link>
            </div>
          </div>
        </section>

        {/* TRUST */}
        <section className="sec">
          <div className="container">
            <h2 className="h2 reveal">Trust the code.<span className="sub">Not the team.</span></h2>
            <div className="trust3 reveal">
              <div><ShieldCheck className="ico" /><h3>Trade-only agent</h3><p>The desk&apos;s HyperCore agent can place and cancel orders. It has no withdraw path. A leaked key can&apos;t move funds.</p></div>
              <div><Lock className="ico" /><h3>Hard limits on-chain</h3><p>Max position, max daily loss and max drawdown are enforced in the contract. Breach one and quoting stops.</p></div>
              <div><Eye className="ico" /><h3>Everything public</h3><p>Every fill, every burn and every parameter change is an event. Changes go through a 48-hour timelock.</p></div>
            </div>
          </div>
        </section>

        {/* ROADMAP */}
        <section className="sec" id="roadmap" style={{ paddingTop: 0 }}>
          <div className="container">
            <div className="sec-head reveal">
              <h2 className="h2">Shipped with Elysium.<span className="sub">Each phase unlocks with the chain.</span></h2>
            </div>
            <div className="road reveal">
              {ROAD.map(r => (
                <div key={r.ph} className={r.now ? "now" : ""}>
                  <div className="ph"><span>{r.ph}</span>{r.now && <span className="pill mint live"><span className="dot" />Now</span>}</div>
                  <h3>{r.h}</h3>
                  <div className="dep">{r.dep}</div>
                  <ul>
                    {r.items.map(i => (
                      <li key={i}>{r.now ? <Check className="ico" /> : <ArrowRight className="ico" />}{i}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="sec" id="faq" style={{ paddingTop: 0 }}>
          <div className="container faq-grid">
            <h2 className="h2 reveal">Questions.<span className="sub">Answered.</span></h2>
            <div className="faq reveal">
              {FAQ.map(([q, a]) => (
                <details key={q}>
                  <summary>{q}<Plus className="ico" /></summary>
                  <p>{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* COMMUNITY */}
        <section className="sec" style={{ paddingTop: 0 }}>
          <div className="container">
            <h2 className="mega-2 reveal">Join the desk.</h2>
            <div className="comm reveal">
              <a href={cfg.brand.xUrl} target="_blank" rel="noopener">
                <XLogo className="brandico" />
                <ArrowUpRight className="ico arr" />
                <h3>X</h3>
                <p>Follow @{cfg.brand.x} for burn reports, desk updates and the official contract address.</p>
              </a>
              <a href={cfg.brand.telegramUrl} target="_blank" rel="noopener">
                <Send className="ico brandico" strokeWidth={1.6} />
                <ArrowUpRight className="ico arr" />
                <h3>Telegram</h3>
                <p>Talk to the team and other holders, and see desk events as they happen.</p>
              </a>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
      <RevealObserver />
      </Experience>
    </>
  );
}
