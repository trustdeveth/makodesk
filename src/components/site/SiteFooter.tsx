import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-top">
          <Link className="brand" href="/">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="" />Mako Desk
          </Link>
          <nav className="footer-links">
            <Link href="/app">App</Link>
            <Link href="/docs">Docs</Link>
            <Link href="/docs#contracts">Contracts</Link>
            <Link href="/docs#security">Security</Link>
            <Link href="/docs#brand">Brand kit</Link>
            <Link href="/docs#legal">Risk disclosure</Link>
          </nav>
        </div>
        <p className="legal">
          $MAKO is a memecoin with no intrinsic value and no expectation of financial return. The desk is an experimental,
          capped on-chain trading strategy that can lose money. Prices shown in preview mode are simulated. Nothing on this
          site is investment advice. Elysium, Kinetiq, Hyperliquid and HyperCore are independent third parties with no
          affiliation to Mako Desk.
        </p>
        <p className="copy">© 2026 Mako Desk</p>
      </div>
    </footer>
  );
}
