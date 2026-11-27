import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Info, TriangleAlert } from "lucide-react";
import { getConfig } from "@/lib/config";
import { SiteNav } from "@/components/site/SiteNav";
import { DocsSidebar, DocsToc, type DocGroup } from "@/components/docs/DocsSidebar";
import { CodeBlock } from "@/components/docs/CodeBlock";

export const metadata: Metadata = {
  title: "Docs",
  description: "Documentation for Mako Desk and $MAKO: quickstart, token, desk architecture, Mood Engine, API, contracts, security and brand kit.",
};

const GROUPS: DocGroup[] = [
  { title: "Start", items: [{ id: "intro", label: "Introduction" }, { id: "identity", label: "Project identity" }, { id: "quickstart", label: "Quickstart" }, { id: "bridge", label: "Bridging HYPE" }] },
  { title: "Protocol", items: [{ id: "token", label: "Token" }, { id: "desk", label: "The Desk" }, { id: "risk", label: "Risk controls" }, { id: "mood", label: "Mood Engine" }, { id: "burns", label: "Buyback & burn" }] },
  { title: "Developers", items: [{ id: "elysium", label: "Elysium primer" }, { id: "integration", label: "Integration" }, { id: "api", label: "HTTP API" }, { id: "contracts", label: "Contracts" }, { id: "configuration", label: "Configuration" }] },
  { title: "Project", items: [{ id: "roadmap", label: "Roadmap" }, { id: "security", label: "Security" }, { id: "brand", label: "Brand kit" }, { id: "faq", label: "FAQ" }, { id: "legal", label: "Legal" }] },
];

const Warn = ({ children }: { children: React.ReactNode }) => (
  <div className="callout warn"><span className="ic"><TriangleAlert className="ico ico-sm" /></span><div>{children}</div></div>
);
const Note = ({ children }: { children: React.ReactNode }) => (
  <div className="callout info"><span className="ic"><Info className="ico ico-sm" /></span><div>{children}</div></div>
);
const Sw = ({ c }: { c: string }) => <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, marginRight: 8, background: c }} />;

const IFACE = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IMakoDesk {
    enum Mood { Feeding, Hunting, Cruising, Circling, Breach }

    struct DeskState {
        Mood    mood;
        int256  fundingE8;       // 1h funding, 1e8 = 1%
        uint256 midPriceE8;      // HYPE-PERP mid, USD 1e8
        int256  positionE8;      // signed HYPE notional
        int256  realizedPnlUsdE6;
        uint256 totalBurned;     // MAKO, 18 decimals
        bool    paused;
        uint64  coreBlock;       // HyperCore block of last read
    }

    function mood() external view returns (Mood);
    function state() external view returns (DeskState memory);
    function poke() external;    // permissionless; tips caller in HYPE

    event Quoted(uint64 indexed coreBlock, uint256 bidE8, uint256 askE8, uint256 sizeE8);
    event Filled(uint64 indexed coreBlock, bool isBuy, uint256 pxE8, uint256 szE8, int256 edgeUsdE6);
    event MoodChanged(Mood from, Mood to, int256 fundingE8);
    event Burned(uint256 amount, bytes32 reason, uint256 indexed epoch);
    event KillSwitch(address indexed caller, bytes32 reason);
}`;

const VIEM = `// viem example
import { createPublicClient, http } from "viem";

const client = createPublicClient({ transport: http(ELYSIUM_RPC) });
const MOODS = ["Feeding", "Hunting", "Cruising", "Circling", "Breach"];

const mood = await client.readContract({
  address: MAKO_DESK,
  abi: [{ name: "mood", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] }],
  functionName: "mood",
});
console.log("Mako is", MOODS[mood]);`;

const SSE = `// Browser: live desk stream
const es = new EventSource("https://makodesk.xyz/api/desk/stream");
es.onmessage = (e) => {
  const s = JSON.parse(e.data);
  console.log(s.mood.label, s.mid, s.burned);
};`;

const ENV = `MAKO_PREVIEW_MODE=true
ELYSIUM_CHAIN_ID=99901
ELYSIUM_RPC_URL=https://rpc.elysium.example
ELYSIUM_EXPLORER_URL=https://explorer.elysium.example
MAKO_TOKEN_ADDRESS=0x...
MAKO_DESK_ADDRESS=0x...
MAKO_LP_ADDRESS=0x...
MAKO_SWAP_URL=https://...`;

export default function DocsPage() {
  const cfg = getConfig();
  const addr = (a: string) =>
    a ? <a className="lk" href={`${cfg.chain.explorer}/address/${a}`} target="_blank" rel="noopener">{a}</a> : <span className="muted">Published at deployment</span>;

  return (
    <>
      <SiteNav wide badge="Docs" links={[{ href: "/", label: "Home" }, { href: "/app", label: "App" }, { href: "/docs", label: "Docs", active: true }]} />
      <div className="docs">
        <DocsSidebar groups={GROUPS} />

        <main className="dmain">
          <section id="intro">
            <span className="eyebrow">Documentation</span>
            <h1>Mako Desk</h1>
            <p className="lead">$MAKO is a memecoin with its own on-chain trading desk. It runs natively on Elysium, reads Hyperliquid&apos;s order books through a precompile, makes markets on HyperCore, and burns its profits.</p>
            <p>Most memecoins depend entirely on attention. $MAKO adds a working mechanism underneath. A treasury contract, <code>MakoDesk</code>, quotes two-sided markets on HyperCore under hard risk limits. Realized profit is used to buy $MAKO on the open market and send it to the burn address. Everything happens in contracts and can be checked on the explorer.</p>
            <div className="cards2">
              <a href="#quickstart"><b>Quickstart <ArrowRight className="ico ico-sm" style={{ display: "inline", verticalAlign: -2 }} /></b><span>Add Elysium, bridge HYPE and buy $MAKO in a few minutes.</span></a>
              <a href="#desk"><b>How the desk works <ArrowRight className="ico ico-sm" style={{ display: "inline", verticalAlign: -2 }} /></b><span>Architecture, the quoting loop and custody model.</span></a>
              <a href="#api"><b>HTTP API <ArrowRight className="ico ico-sm" style={{ display: "inline", verticalAlign: -2 }} /></b><span>Desk state, live stream, quotes and supply endpoints.</span></a>
              <a href="#security"><b>Security <ArrowRight className="ico ico-sm" style={{ display: "inline", verticalAlign: -2 }} /></b><span>What can and can&apos;t happen to the treasury.</span></a>
            </div>
            <Warn><b>Current status: Phase 1 (Surface).</b> The token and liquidity are live first. The desk switches on with Elysium&apos;s Phase 2 ArbOS upgrade, which adds the HyperCore market-data precompile and ElysiumCoreWriter. Until then the app runs in clearly labelled preview mode.</Warn>
          </section>

          <section id="identity">
            <h2>Project identity</h2>
            <p>These are the only official names and channels. Anything else is not us.</p>
            <div className="tw"><table className="dtable"><tbody>
              <tr><th>Field</th><th>Value</th><th>Notes</th></tr>
              <tr><td>Project name</td><td><strong>Mako Desk</strong></td><td>The mako is the fastest shark, matching Elysium&apos;s 100 ms blocks. &quot;Mako&quot; also reads as <em>MArKet maker</em>.</td></tr>
              <tr><td>Token name</td><td><strong>Mako</strong></td><td>ERC-20 on Elysium, 18 decimals</td></tr>
              <tr><td>Ticker</td><td className="mono">$MAKO</td><td>Some unrelated Solana tokens use the same ticker. Always verify the Elysium contract address.</td></tr>
              <tr><td>Tagline</td><td>The memecoin that makes markets.</td><td></td></tr>
              <tr><td>Domain</td><td className="mono">makodesk.xyz</td><td>Backup domains: <span className="mono">makodesk.trade</span>, <span className="mono">makodesk.fun</span></td></tr>
              <tr><td>X (Twitter)</td><td className="mono">@makodeskapp</td><td>Contract address is posted here and on the website only</td></tr>
              <tr><td>Telegram</td><td className="mono">t.me/makodesk</td><td>Admins never DM first</td></tr>
            </tbody></table></div>
          </section>

          <section id="quickstart">
            <h2>Quickstart</h2>
            <p>You need an EVM wallet (Rabby, MetaMask, OKX Wallet) and some HYPE.</p>
            <ol>
              <li><strong>Open the app</strong> at <Link className="lk" href="/app">makodesk.xyz/app</Link> and click <em>Connect wallet</em>.</li>
              <li><strong>Add Elysium.</strong> The app will prompt you to add the network, or add it manually with the values below.</li>
              <li><strong>Bridge HYPE</strong> from HyperEVM to Elysium (see <a className="lk" href="#bridge">Bridging</a>). HYPE is the gas token, so keep a little for fees.</li>
              <li><strong>Swap</strong> HYPE for $MAKO on the <em>Swap</em> screen, then use <em>Add token</em> so your wallet shows your balance.</li>
            </ol>
            <div className="tw"><table className="dtable"><tbody>
              <tr><th>Network field</th><th>Value</th></tr>
              <tr><td>Network name</td><td className="mono">Elysium</td></tr>
              <tr><td>Chain ID</td><td className="mono">{cfg.chain.chainId}</td></tr>
              <tr><td>Currency symbol</td><td className="mono">HYPE</td></tr>
              <tr><td>RPC URL</td><td className="mono">{cfg.chain.rpcUrl}</td></tr>
              <tr><td>Explorer</td><td className="mono">{cfg.chain.explorer}</td></tr>
            </tbody></table></div>
            <Note>Always take network details from Kinetiq&apos;s official Elysium docs. This site reads them from the server&apos;s <code>.env</code>, so there is one place to update.</Note>
          </section>

          <section id="bridge">
            <h2>Bridging HYPE</h2>
            <p>Elysium uses native HYPE for gas, bridged 1:1 from HyperEVM, so there&apos;s no separate gas token to buy.</p>
            <ul>
              <li><strong>Native bridge:</strong> deposits arrive in minutes. Withdrawals back to HyperEVM currently take about 24 hours.</li>
              <li><strong>Instant routes:</strong> Relay, Enso and Jumper offer fast bridging in both directions for a fee.</li>
            </ul>
            <Warn>Elysium is a young chain: one sequencer, a whitelisted validator set, and permissionless fraud proofs (BoLD) still on the roadmap. Size your positions with that in mind.</Warn>
          </section>

          <section id="token">
            <h2>Token</h2>
            <p>$MAKO is a plain ERC-20 with a fixed supply and no admin functions. Supply can only go down.</p>
            <div className="tw"><table className="dtable"><tbody>
              <tr><th>Allocation</th><th>Share</th><th>Tokens</th><th>Terms</th></tr>
              <tr><td>Fair-launch liquidity</td><td className="mono">70%</td><td className="mono">700,000,000</td><td>Paired with HYPE at launch. LP position locked.</td></tr>
              <tr><td>Desk treasury</td><td className="mono">20%</td><td className="mono">200,000,000</td><td>Held by the <code>MakoDesk</code> contract as inventory for MAKO/HYPE quoting. Never held by a wallet.</td></tr>
              <tr><td>Community &amp; ecosystem</td><td className="mono">10%</td><td className="mono">100,000,000</td><td>Listings, builder grants, campaigns. 12-month linear unlock, reported publicly.</td></tr>
              <tr><td>Team</td><td className="mono">0%</td><td className="mono">0</td><td>None. The team buys at launch like everyone else.</td></tr>
            </tbody></table></div>
            <ul>
              <li><strong>Total supply:</strong> 1,000,000,000 MAKO. No mint function.</li>
              <li><strong>Tax:</strong> 0% buy, 0% sell.</li>
              <li><strong>Ownership:</strong> renounced at deployment. No proxy, no blacklist, no pause.</li>
              <li><strong>Explorer verification:</strong> token info is verified on the official Elysium explorer (100 KNTQ, burned by the explorer program).</li>
            </ul>
          </section>

          <section id="desk">
            <h2>The Desk</h2>
            <p><code>MakoDesk</code> is the treasury contract that trades. It runs a simple, auditable market-making loop on HyperCore:</p>
            <ol>
              <li><strong>Sense.</strong> It reads the HYPE-PERP order book (full depth), mid price, funding and recent liquidations through Elysium&apos;s market-data precompile, at HyperCore block granularity (~70 ms) and about 150–350 ms fresh inside the EVM.</li>
              <li><strong>Decide.</strong> It computes a fair price, applies inventory skew and a spread set by the current <a className="lk" href="#mood">mood</a>, and checks every <a className="lk" href="#risk">risk limit</a>.</li>
              <li><strong>Quote.</strong> It places and cancels resting orders on HyperCore through <code>ElysiumCoreWriter</code> in about 100 ms, using a trade-only agent on the desk&apos;s own HyperCore sub-account.</li>
              <li><strong>Settle.</strong> Realized PnL is tallied each epoch. Profit goes to <a className="lk" href="#burns">buyback &amp; burn</a>.</li>
            </ol>
            <h3>Who triggers the loop?</h3>
            <p>Anyone. <code>poke()</code> is permissionless and pays a small HYPE tip to the caller, so quoting doesn&apos;t depend on a team-run server. A public keeper is provided as a fallback.</p>
            <h3>Custody model</h3>
            <ul>
              <li>The HyperCore agent can <strong>place and cancel orders only</strong>. It has no transfer or withdraw permission.</li>
              <li>Desk capital lives in the contract and its dedicated HyperCore sub-account, never in a team wallet.</li>
              <li>Parameter changes go through a <strong>48-hour timelock</strong> and are announced on @makodeskapp before they take effect.</li>
            </ul>
          </section>

          <section id="risk">
            <h2>Risk controls</h2>
            <p>Market making can lose money, so the limits are enforced by the contract itself.</p>
            <div className="tw"><table className="dtable"><tbody>
              <tr><th>Control</th><th>Launch value</th><th>Behaviour</th></tr>
              <tr><td>Max position</td><td className="mono">2,500 HYPE notional</td><td>Orders that would exceed it are rejected on-chain.</td></tr>
              <tr><td>Max daily loss</td><td className="mono">$4,000</td><td>When hit, the desk cancels all quotes and pauses until the next UTC day.</td></tr>
              <tr><td>Max drawdown</td><td className="mono">15% of desk capital</td><td>Triggers the kill-switch. Resuming needs a timelocked call.</td></tr>
              <tr><td>Inventory skew</td><td className="mono">±40%</td><td>Quotes lean toward reducing inventory past this band.</td></tr>
              <tr><td>Stale data guard</td><td className="mono">&gt; 750 ms</td><td>If precompile data is stale, the desk cancels and waits.</td></tr>
              <tr><td>Kill-switch</td><td className="mono">public</td><td>Anyone can trigger it when any limit is provably breached.</td></tr>
            </tbody></table></div>
            <p>Caps start small and are raised only once the desk has a public track record, always through the timelock.</p>
          </section>

          <section id="mood">
            <h2>Mood Engine</h2>
            <p>Mako&apos;s mood is a public on-chain state derived from HyperCore funding and liquidation flow. It changes how the desk quotes, and gives the community a live signal to rally around.</p>
            <div className="tw"><table className="dtable"><tbody>
              <tr><th>Mood</th><th>Trigger (1h funding)</th><th>Desk spread</th><th>Burn multiplier</th></tr>
              <tr><td><Sw c="#3ee6a8" />Feeding Frenzy</td><td className="mono">&lt; −0.40%</td><td className="mono">1.5 bps</td><td className="mono">1.5x</td></tr>
              <tr><td><Sw c="#34b7dd" />Hunting</td><td className="mono">−0.40% to 0</td><td className="mono">2 bps</td><td className="mono">1.2x</td></tr>
              <tr><td><Sw c="#93d9ee" />Cruising</td><td className="mono">0 to 0.60%</td><td className="mono">3 bps</td><td className="mono">1.0x</td></tr>
              <tr><td><Sw c="#ffc247" />Circling</td><td className="mono">0.60% to 1.20%</td><td className="mono">6 bps</td><td className="mono">0.8x</td></tr>
              <tr><td><Sw c="#ff5252" />Breach</td><td className="mono">&gt; 1.20% or liquidation cascade</td><td className="mono">12 bps</td><td className="mono">2.0x wick bonus</td></tr>
            </tbody></table></div>
            <h3>Wick detector</h3>
            <p>If HYPE drops more than a threshold within a few HyperCore blocks while liquidations spike, the desk enters <strong>Breach</strong> and arms a <em>wick bonus</em>. The next settlement burns at 2x the normal share, still funded only from realized profit.</p>
          </section>

          <section id="burns">
            <h2>Buyback &amp; burn</h2>
            <ul>
              <li>At each epoch, <strong>{cfg.tokenomics.burnShare}%</strong> of realized desk profit buys $MAKO from the official pool and sends it to <code>0x000…dEaD</code>. The rest is kept as desk capital.</li>
              <li>Burns are never funded from principal. A losing epoch burns nothing.</li>
              <li>Each burn emits <code>Burned(amount, reason, epoch)</code> and appears in the app&apos;s Burn log with its transaction.</li>
            </ul>
          </section>

          <section id="elysium">
            <h2>Elysium primer</h2>
            <p>Elysium is Kinetiq&apos;s EVM Layer 2 for the Hyperliquid ecosystem, built on Arbitrum Orbit (Nitro / ArbOS) and settling to HyperEVM. Mainnet went live on November 9, 2026.</p>
            <div className="tw"><table className="dtable"><tbody>
              <tr><th>Property</th><th>Value</th></tr>
              <tr><td>Block time</td><td>100 ms canonical blocks (~300 ms perceived receipt)</td></tr>
              <tr><td>Throughput target</td><td>300 Mgas/s</td></tr>
              <tr><td>Gas token</td><td>Native HYPE, bridged 1:1 from HyperEVM</td></tr>
              <tr><td>Data availability</td><td>AnyTrust (certificate posted to HyperEVM)</td></tr>
              <tr><td>Sequencing</td><td>Single sequencer (operated with Conduit), priority-fee ordering</td></tr>
              <tr><td>Phase 2</td><td>HyperCore market-data precompile + ElysiumCoreWriter (fast trading lane)</td></tr>
            </tbody></table></div>
          </section>

          <section id="integration">
            <h2>Integration</h2>
            <p>Other contracts can read the desk&apos;s state, for example to build on the mood signal or show burn stats.</p>
            <CodeBlock title="IMakoDesk.sol" code={IFACE} />
            <h3>Reading from a frontend</h3>
            <CodeBlock title="read-mood.js" code={VIEM} />
            <Note><b>About the precompile ABI.</b> Kinetiq hasn&apos;t published the final interfaces for the market-data precompile and ElysiumCoreWriter yet. <code>MakoDesk</code> wraps them behind an internal adapter, so the public interface above stays the same when they ship.</Note>
          </section>

          <section id="api">
            <h2>HTTP API</h2>
            <p>The Mako Desk server exposes the same data the app uses. All endpoints are public, read-only and CORS-enabled.</p>
            <div className="tw"><table className="dtable"><tbody>
              <tr><th>Endpoint</th><th>Returns</th></tr>
              <tr><td className="mono">GET /api/desk/state</td><td>Full desk snapshot: mood, book, fills, burns, PnL, risk usage</td></tr>
              <tr><td className="mono">GET /api/desk/stream</td><td>Server-Sent Events, one desk snapshot every ~500 ms</td></tr>
              <tr><td className="mono">GET /api/desk/fills?limit=20</td><td>Latest desk fills</td></tr>
              <tr><td className="mono">GET /api/burns</td><td>Burn log and totals</td></tr>
              <tr><td className="mono">GET /api/quote?side=buy&amp;amount=10&amp;slippage=1</td><td>Swap quote estimate for MAKO/HYPE</td></tr>
              <tr><td className="mono">GET /api/token/total</td><td>Total supply as a plain number (for CoinGecko / CMC)</td></tr>
              <tr><td className="mono">GET /api/token/circulating</td><td>Circulating supply as a plain number</td></tr>
              <tr><td className="mono">GET /api/token/burned</td><td>Burned supply as a plain number</td></tr>
              <tr><td className="mono">GET /api/config</td><td>Public network, contract and link config</td></tr>
              <tr><td className="mono">GET /api/health</td><td>Liveness for uptime monitors</td></tr>
            </tbody></table></div>
            <CodeBlock title="stream.js" code={SSE} />
            <Note>Every response carries a <code>mode</code> field. While it is <code>&quot;preview&quot;</code>, desk data is simulated.</Note>
          </section>

          <section id="contracts">
            <h2>Contracts</h2>
            <p>Addresses are published here, on makodesk.xyz and on @makodeskapp at deployment. Treat any address from another source as a scam.</p>
            <div className="tw"><table className="dtable"><tbody>
              <tr><th>Contract</th><th>Address</th><th>Status</th></tr>
              <tr><td>$MAKO token</td><td className="mono">{addr(cfg.contracts.token)}</td><td>Phase 1</td></tr>
              <tr><td>MakoDesk</td><td className="mono">{addr(cfg.contracts.desk)}</td><td>Phase 2–3</td></tr>
              <tr><td>LP lock</td><td className="mono">{addr(cfg.contracts.lp)}</td><td>Phase 1</td></tr>
              <tr><td>Burn address</td><td className="mono">0x000000000000000000000000000000000000dEaD</td><td>—</td></tr>
            </tbody></table></div>
          </section>

          <section id="configuration">
            <h2>Configuration</h2>
            <p>The server reads its configuration from <code>.env</code> at runtime. Edit it and restart the process; no rebuild is needed.</p>
            <CodeBlock title=".env" code={ENV} />
            <p>Set <code>MAKO_PREVIEW_MODE=false</code> once the desk contract is live and the live reader is wired in. See <code>README.md</code> for VPS deployment.</p>
          </section>

          <section id="roadmap">
            <h2>Roadmap</h2>
            <p>Each phase starts only once the Elysium feature it depends on is live.</p>
            <div className="tw"><table className="dtable"><tbody>
              <tr><th>Phase</th><th>Depends on</th><th>Delivers</th></tr>
              <tr><td><strong>1 · Surface</strong> <span className="pill mint" style={{ height: 20, marginLeft: 6 }}>now</span></td><td>Elysium mainnet (live)</td><td>Fair launch, LP lock, explorer verification, preview app, docs</td></tr>
              <tr><td><strong>2 · Sense</strong></td><td>ArbOS upgrade: market-data precompile</td><td>Live Mood Engine, wick detector, real-time dashboard</td></tr>
              <tr><td><strong>3 · Strike</strong></td><td>ElysiumCoreWriter stable</td><td>Desk quoting under caps, audit, buyback &amp; burn loop</td></tr>
              <tr><td><strong>4 · Apex</strong></td><td>Track record</td><td>HyperCore spot listing path, higher caps, multi-market desk</td></tr>
            </tbody></table></div>
          </section>

          <section id="security">
            <h2>Security</h2>
            <ul>
              <li><strong>Token:</strong> minimal OpenZeppelin ERC-20 with no owner functions, verified source.</li>
              <li><strong>Desk:</strong> external audit before the desk holds capital. The report will be linked here.</li>
              <li><strong>Agent keys:</strong> trade-only. A leaked key can&apos;t move funds, and losses are bounded by the on-chain caps.</li>
              <li><strong>Chain risk:</strong> Elysium is new and currently runs one sequencer with whitelisted validators. The stale-data guard cancels quotes when reads lag.</li>
              <li><strong>Bug bounty:</strong> report issues to <span className="mono">security@makodesk.xyz</span>.</li>
            </ul>
          </section>

          <section id="brand">
            <h2>Brand kit</h2>
            <p>Use these assets freely for community content. Please don&apos;t change the logo&apos;s shape or colors.</p>
            <div className="logo-tiles">
              {/* eslint-disable @next/next/no-img-element */}
              <div style={{ background: "#010608" }}><img src="/logo.svg" alt="Mako Desk logo on dark" /></div>
              <div style={{ background: "#0b2026" }}><img src="/logo.svg" alt="Mako Desk logo on surface" /></div>
              <div style={{ background: "#ffffff" }}><img src="/logo.svg" alt="Mako Desk logo on white" /></div>
            </div>
            <div className="brandgrid">
              {[["Elysium Cyan", "#34B7DD"], ["Deep Teal", "#04181C"], ["Abyss", "#010608"], ["Ice", "#DBF2F9"], ["Breach", "#FF5252"], ["Bid", "#3EE6A8"]].map(([n, c]) => (
                <div className="swatch" key={c}><div className="c" style={{ background: c, borderBottom: "1px solid var(--line)" }} /><div>{n}<small>{c}</small></div></div>
              ))}
            </div>
            <p><strong>Type:</strong> DM Sans for headings and text, Geist Mono for numbers and code.<br /><strong>Voice:</strong> calm, precise, a little dry. The shark doesn&apos;t shout.</p>
          </section>

          <section id="faq">
            <h2>FAQ</h2>
            <h3>Is the desk live?</h3>
            <p>Not yet. It needs Elysium&apos;s Phase 2 upgrade. The app&apos;s preview mode shows how it will behave, and every simulated number is labelled as such.</p>
            <h3>Can the desk lose money?</h3>
            <p>Yes. Losses are capped per day and in total, and quoting pauses automatically when a limit is hit. Burns only come from realized profit.</p>
            <h3>Why no tax?</h3>
            <p>Taxes hurt liquidity and look like a cash grab. The desk is meant to earn from the market, not from holders.</p>
            <h3>Where is the official contract address?</h3>
            <p>Only on makodesk.xyz, these docs and @makodeskapp.</p>
          </section>

          <section id="legal">
            <h2>Legal</h2>
            <p>$MAKO is a memecoin. It has no intrinsic value and carries no promise of profit, dividends or returns. The desk is an experimental, capped trading strategy that can lose money, and its results don&apos;t entitle holders to anything. Nothing in these docs is financial, legal or tax advice. Elysium, Kinetiq, Hyperliquid and HyperCore are independent third parties with no affiliation to Mako Desk. Participation may be restricted in your jurisdiction, and you&apos;re responsible for following local law.</p>
            <div className="dpager">
              <Link className="btn" href="/"><ArrowLeft className="ico ico-sm" />Home</Link>
              <Link className="btn btn-primary" href="/app">Launch app<ArrowRight className="ico ico-sm" /></Link>
            </div>
          </section>
        </main>

        <DocsToc groups={GROUPS} />
      </div>
    </>
  );
}
