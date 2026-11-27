"use client";
import { useState } from "react";

const KW = "pragma|solidity|interface|contract|function|external|view|returns|memory|event|enum|struct|indexed|import|from|const|await|return|if|else|new|let";
const TY = "uint256|uint64|uint8|int256|address|bool|bytes32|string";
const RE = new RegExp(`(\\/\\/[^\\n]*|#[^\\n]*)|("(?:[^"\\\\]|\\\\.)*")|\\b(${KW})\\b|\\b(${TY})\\b|\\b(\\d[\\d_.]*)\\b|\\b([A-Za-z_]\\w*)(?=\\()`, "g");

function highlight(src: string) {
  const out: React.ReactNode[] = [];
  let last = 0, m: RegExpExecArray | null, i = 0;
  RE.lastIndex = 0;
  while ((m = RE.exec(src))) {
    if (m.index > last) out.push(src.slice(last, m.index));
    const cls = m[1] ? "c" : m[2] ? "s" : m[3] ? "k" : m[4] ? "t" : m[5] ? "n" : "f";
    out.push(<span key={i++} className={"tk-" + cls}>{m[0]}</span>);
    last = RE.lastIndex;
  }
  out.push(src.slice(last));
  return out;
}

export function CodeBlock({ title, code }: { title: string; code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="code">
      <div className="ch">
        <span>{title}</span>
        <button onClick={() => navigator.clipboard?.writeText(code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1400); })}>
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre>{highlight(code)}</pre>
    </div>
  );
}
