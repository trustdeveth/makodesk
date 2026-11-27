"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { ArrowDownUp, BookOpen, ChartCandlestick, ExternalLink, Flame, Gauge, LayoutDashboard, MessagesSquare, Wallet } from "lucide-react";
import { useLive } from "@/components/providers/LiveProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { WalletProvider, useWallet } from "./WalletProvider";
import { ChatProvider } from "@/components/chat/ChatProvider";
import { fmt } from "@/lib/format";

const NAV = [
  { href: "/app", label: "Overview", short: "Home", Icon: LayoutDashboard },
  { href: "/app/terminal", label: "Terminal", short: "Trade", Icon: ChartCandlestick },
  { href: "/app/chat", label: "Chat", short: "Chat", Icon: MessagesSquare },
  { href: "/app/desk", label: "Desk", short: "Desk", Icon: BookOpen },
  { href: "/app/swap", label: "Swap", short: "Swap", Icon: ArrowDownUp },
  { href: "/app/mood", label: "Mood Engine", short: "Mood", Icon: Gauge },
  { href: "/app/burns", label: "Burn log", short: "Burns", Icon: Flame },
];
const WIDE = ["/app/terminal", "/app/chat"];

const errMsg = (e: unknown) => ((e as Error)?.message || "Request rejected").slice(0, 90);

function TopBar({ title }: { title: string }) {
  const s = useLive();
  const w = useWallet();
  const toast = useToast();
  return (
    <header className="topbar">
      <Link className="brand mobile-brand" href="/">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.svg" alt="Mako Desk" />
      </Link>
      <h1>{title}</h1>
      {s?.live?.market ? (
        <span className="pill mint live hide-xs" title="Market data streams live from Hyperliquid"><span className="dot" />Live</span>
      ) : (
        <span className="pill hide-xs"><span className="dot" style={{ background: "var(--muted)", boxShadow: "none" }} />Connecting…</span>
      )}
      <div className="spacer" />
      {s?.live?.token && <span className="pill hide-xs num">$MAKO {fmt.usd(s.makoPrice, 6)}</span>}
      {w.address && !w.onElysium && (
        <button className="btn btn-sm" style={{ color: "var(--warn)", borderColor: "rgba(255,194,71,.45)" }} onClick={() => w.ensureNetwork().catch(e => toast(errMsg(e), "warn"))}>
          Switch to Elysium
        </button>
      )}
      {w.address ? (
        <button className="btn btn-sm wallet-btn" onClick={() => navigator.clipboard?.writeText(w.address!).then(() => toast("Address copied", "check"))}>
          <span className="av" /><span className="addr">{fmt.short(w.address)}</span>
        </button>
      ) : (
        <button className="btn btn-primary btn-sm wallet-btn" onClick={() => w.connect().catch(e => toast(errMsg(e), "warn"))}>
          <Wallet className="ico ico-sm" />Connect wallet
        </button>
      )}
    </header>
  );
}

/** Toast whenever a new burn lands. */
function BurnToaster() {
  const s = useLive();
  const toast = useToast();
  const last = useRef<string | null>(null);
  useEffect(() => {
    const b = s?.burns[0];
    if (!b) return;
    if (last.current && last.current !== b.tx) toast(`${fmt.num(b.amount)} MAKO burned · ${b.reason}`, "flame");
    last.current = b.tx;
  }, [s, toast]);
  return null;
}

function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const s = useLive();
  const active = NAV.find(n => (n.href === "/app" ? path === "/app" : path.startsWith(n.href))) ?? NAV[0];
  const wide = WIDE.includes(active.href);

  return (
    <div className="app-root">
      <div className="shell">
        <aside className="side">
          <Link className="brand" href="/">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="" />Mako Desk
          </Link>
          <nav aria-label="App">
            {NAV.map(({ href, label, Icon }) => (
              <Link key={href} href={href} className={active.href === href ? "active" : ""}><Icon className="ico" />{label}</Link>
            ))}
          </nav>
          <div className="side-foot">
            <div className="net">
              <div className="row between" style={{ marginBottom: 6 }}>
                <span className="pill live" style={{ height: 22 }}><span className="dot" />Elysium</span>
                <span className="muted mono" style={{ fontSize: 11 }}>Mainnet</span>
              </div>
              <div className="kv2"><span>Market data</span><b className={s?.live?.market ? "up" : ""}>{s?.live?.market ? "Hyperliquid" : "—"}</b></div>
              <div className="kv2"><span>Desk</span><b>{s?.live?.quoting ? "Quoting" : s?.live?.desk ? "Deployed · halted" : "Deploying"}</b></div>
              <div className="kv2"><span>Gas</span><b>HYPE</b></div>
            </div>
            <Link className="btn btn-ghost btn-sm" href="/docs">Documentation <ExternalLink className="ico ico-sm" /></Link>
          </div>
        </aside>

        <div className="main">
          <TopBar title={active.label} />
          <div className={"content" + (wide ? " wide" : "")}>
            {children}
          </div>
        </div>
      </div>

      <BurnToaster />
      <nav className="tabbar" aria-label="App mobile" style={{ gridTemplateColumns: `repeat(${NAV.length}, 1fr)` }}>
        {NAV.map(({ href, short, Icon }) => (
          <Link key={href} href={href} className={active.href === href ? "active" : ""}><Icon className="ico" />{short}</Link>
        ))}
      </nav>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <WalletProvider>
      <ChatProvider>
        <Shell>{children}</Shell>
      </ChatProvider>
    </WalletProvider>
  );
}
