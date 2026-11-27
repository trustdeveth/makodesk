"use client";
import { useState } from "react";
import { Copy } from "lucide-react";
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

export function CodeCard() {
  const [k, setK] = useState<keyof typeof CODE>("Solidity");
  const toast = useToast();
  const text = CODE[k].map(t => t[0]).join("");
  return (
    <div className="codecard reveal">
      <div className="step-h"><span className="n">1</span>Read the desk state.</div>
      <div className="codetabs">
        {Object.keys(CODE).map(name => (
          <button key={name} className={k === name ? "on" : ""} onClick={() => setK(name)}>{name}</button>
        ))}
      </div>
      <div className="codebox">
        <button className="btn btn-sm cp" onClick={() => navigator.clipboard?.writeText(text).then(() => toast("Copied to clipboard", "check"))}>
          <Copy className="ico ico-sm" />Copy
        </button>
        <pre>{CODE[k].map((t, i) => (t[1] ? <span key={i} className={t[1]}>{t[0]}</span> : <span key={i}>{t[0]}</span>))}</pre>
      </div>
      <div className="step-h"><span className="n">2</span>React to the mood.</div>
      <div className="codenote">Subscribe to <code>MoodChanged</code> and <code>Burned</code> events, or to <code>/api/desk/stream</code>. Mood updates at HyperCore block speed.</div>
    </div>
  );
}
