"use client";
import Link from "next/link";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { XLogo } from "@/components/icons";
import { useConfig } from "@/components/providers/ConfigProvider";

interface NavLink { href: string; label: string; active?: boolean }

export function SiteNav({ links, badge, wide }: { links: NavLink[]; badge?: string; wide?: boolean }) {
  const [open, setOpen] = useState(false);
  const cfg = useConfig();
  return (
    <>
      <header className="nav">
        <div className="container nav-inner" style={wide ? { maxWidth: 1360 } : undefined}>
          <Link className="brand" href="/" aria-label="Mako Desk home">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="" />
            Mako Desk {badge && <span className="tick">{badge}</span>}
          </Link>
          <nav className="nav-links" aria-label="Primary">
            {links.map(l => (
              <Link key={l.href} href={l.href} className={l.active ? "active" : undefined}>{l.label}</Link>
            ))}
          </nav>
          <div className="nav-right">
            <a className="btn btn-ghost btn-sm hide-sm" href={cfg.brand.xUrl} target="_blank" rel="noopener" aria-label="Mako Desk on X">
              <XLogo className="ico ico-sm" />
            </a>
            <Link className="btn btn-primary btn-sm" href="/app">Launch app</Link>
            <button className="nav-burger" aria-label="Menu" aria-expanded={open} onClick={() => setOpen(o => !o)}>
              {open ? <X className="ico" /> : <Menu className="ico" />}
            </button>
          </div>
        </div>
      </header>
      <div className={"mobile-menu" + (open ? " open" : "")} onClick={() => setOpen(false)}>
        {links.map(l => <Link key={l.href} href={l.href}>{l.label}</Link>)}
        <a href={cfg.brand.xUrl} target="_blank" rel="noopener">X / @{cfg.brand.x}</a>
      </div>
    </>
  );
}
