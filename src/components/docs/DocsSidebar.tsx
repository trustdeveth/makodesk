"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { PanelLeft, Search } from "lucide-react";

export interface DocGroup { title: string; items: { id: string; label: string }[] }

export function DocsSidebar({ groups }: { groups: DocGroup[] }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(groups[0].items[0].id);
  const [hits, setHits] = useState<Set<string> | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const all = useMemo(() => groups.flatMap(g => g.items), [groups]);

  // search filter: matches section text
  useEffect(() => {
    const v = q.trim().toLowerCase();
    if (!v) { setHits(null); return; }
    setHits(new Set(all.filter(i => document.getElementById(i.id)?.textContent?.toLowerCase().includes(v)).map(i => i.id)));
  }, [q, all]);

  // "/" focuses search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement !== input.current) { e.preventDefault(); input.current?.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // scrollspy
  useEffect(() => {
    const io = new IntersectionObserver(entries => {
      entries.forEach(en => { if (en.isIntersecting) setActive(en.target.id); });
    }, { rootMargin: "-20% 0px -70% 0px" });
    all.forEach(i => { const el = document.getElementById(i.id); if (el) io.observe(el); });
    return () => io.disconnect();
  }, [all]);

  return (
    <aside className={"dside" + (open ? " open" : "")}>
      <button className="btn btn-sm dtoggle" onClick={() => setOpen(o => !o)}><PanelLeft className="ico ico-sm" />Contents</button>
      <div className="dsearch">
        <Search className="ico ico-sm" />
        <input ref={input} type="search" placeholder="Search docs" aria-label="Search docs" value={q}
          onChange={e => setQ(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter") {
              const first = all.find(i => !hits || hits.has(i.id));
              if (first) location.hash = first.id;
            }
          }} />
        <kbd>/</kbd>
      </div>
      <div className="dgroups">
        {groups.map(g => (
          <div className="dgroup" key={g.title}>
            <h6>{g.title}</h6>
            {g.items.map(i => (
              <a key={i.id} href={"#" + i.id} onClick={() => setOpen(false)}
                className={(active === i.id ? "active " : "") + (hits && !hits.has(i.id) ? "hidden" : "")}>{i.label}</a>
            ))}
          </div>
        ))}
      </div>
    </aside>
  );
}

/** Right-hand "On this page" list for the active section. */
export function DocsToc({ groups }: { groups: DocGroup[] }) {
  const [heads, setHeads] = useState<{ id: string; text: string; sub: boolean }[]>([]);
  useEffect(() => {
    const ids = groups.flatMap(g => g.items.map(i => i.id));
    const build = (sec: Element) => {
      const hs = Array.from(sec.querySelectorAll("h1, h2, h3"));
      hs.forEach((h, i) => { if (!h.id) h.id = sec.id + "-" + i; });
      setHeads(hs.map(h => ({ id: h.id, text: h.textContent ?? "", sub: h.tagName === "H3" })));
    };
    const io = new IntersectionObserver(entries => {
      entries.forEach(en => { if (en.isIntersecting) build(en.target); });
    }, { rootMargin: "-20% 0px -70% 0px" });
    ids.forEach(id => { const el = document.getElementById(id); if (el) io.observe(el); });
    const first = document.getElementById(ids[0]);
    if (first) build(first);
    return () => io.disconnect();
  }, [groups]);

  return (
    <aside className="dtoc">
      <h6>On this page</h6>
      <div>{heads.map(h => <a key={h.id} href={"#" + h.id} style={h.sub ? { paddingLeft: 22 } : undefined}>{h.text}</a>)}</div>
    </aside>
  );
}
