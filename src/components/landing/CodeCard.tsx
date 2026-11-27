"use client";
import { useLayoutEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { useToast } from "@/components/providers/ToastProvider";

type Tok = [string, string?]; // [text, className]
const K = (t: string): Tok => [t, "k"], S = (t: string): Tok => [t, "s"], C = (t: string): Tok => [t, "c"], P = (t: string): Tok => [t];

const CODE: Record<string, Tok[]> = {
  Solidity: [
    C("// Read Mako's live mood from your contract"), P("\n"),
    K("IMakoDesk"), P(" desk = "), K("IMakoDesk"), P("(MAKO_DESK);\n"),
    K("IMakoDesk.DeskState"), P(" "), K("memory"), P(" s = desk.state();\n\n"),
    K("if"), P(" (s.mood == "), K("IMakoDesk.Mood"), P(".Breach) {\n    "),
    C("// wick bonus armed: the desk is buying the flush"), P("\n}"),
  ],
  viem: [
    K("const"), P(" mood = "), K("await"), P(" client.readContract({\n  address: MAKO_DESK,\n  abi: makoDeskAbi,\n  functionName: "),
    S('"mood"'), P(",\n});\nconsole.log("), S('"Mako is"'), P(", MOODS[mood]);"),
  ],
  "REST API": [
    C("# Same data the app uses, from this server"), P("\ncurl https://makodesk.xyz/api/desk/state\n\n"),
    C("# Live stream (Server-Sent Events)"), P("\ncurl -N https://makodesk.xyz/api/desk/stream\n\n"),
    C("# Swap quote"), P("\ncurl "), S('"https://makodesk.xyz/api/quote?side=buy&amount=10"'),
  ],
};
const NAMES = Object.keys(CODE);

/** Split tokens into lines so each line can animate in on its own. */
function toLines(toks: Tok[]): Tok[][] {
  const lines: Tok[][] = [[]];
  for (const [text, cls] of toks) {
    text.split("\n").forEach((part, i) => {
      if (i > 0) lines.push([]);
      if (part) lines[lines.length - 1].push([part, cls]);
    });
  }
  return lines;
}

export function CodeCard() {
  const [k, setK] = useState<string>("Solidity");
  const [copied, setCopied] = useState(false);
  const toast = useToast();
  const tabsRef = useRef<HTMLDivElement>(null);
  const [ind, setInd] = useState({ x: 0, w: 0 });
  const text = CODE[k].map(t => t[0]).join("");

  // sliding indicator follows the active tab (tabs have different widths)
  useLayoutEffect(() => {
    const place = () => {
      const el = tabsRef.current?.querySelector<HTMLButtonElement>(`button[data-k="${CSS.escape(k)}"]`);
      if (el) setInd({ x: el.offsetLeft, w: el.offsetWidth });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [k]);

  const copy = () => {
    navigator.clipboard?.writeText(text).then(() => {
      toast("Copied to clipboard", "check");
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    });
  };

  return (
    <div className="codecard reveal">
      <div className="step-h"><span className="n">1</span>Read the desk state.</div>
      <div className="codetabs cc-tabs" ref={tabsRef} role="tablist">
        <span className="cc-ind" aria-hidden="true" style={{ transform: `translateX(${ind.x}px)`, width: ind.w }} />
        {NAMES.map(name => (
          <button key={name} data-k={name} role="tab" aria-selected={k === name} className={k === name ? "on" : ""} onClick={() => setK(name)}>{name}</button>
        ))}
      </div>
      <div className="codebox cc-box">
        <button className={"btn btn-sm cp cc-copy" + (copied ? " done" : "")} onClick={copy}>
          <span className="cc-ic">{copied ? <Check className="ico ico-sm" /> : <Copy className="ico ico-sm" />}</span>
          {copied ? "Copied" : "Copy"}
        </button>
        <pre key={k} className="cc-pre">
          {toLines(CODE[k]).map((line, li) => (
            <span key={li} className="cc-line" style={{ animationDelay: `${li * 45}ms` }}>
              {line.length === 0 ? " " : line.map((t, i) => (t[1] ? <span key={i} className={t[1]}>{t[0]}</span> : <span key={i}>{t[0]}</span>))}
            </span>
          ))}
          <span className="cc-scan" aria-hidden="true" />
        </pre>
      </div>
      <div className="step-h"><span className="n">2</span>React to the mood.</div>
      <div className="codenote">Subscribe to <code>MoodChanged</code> and <code>Burned</code> events, or to <code>/api/desk/stream</code>. Mood updates at HyperCore block speed.</div>
    </div>
  );
}
