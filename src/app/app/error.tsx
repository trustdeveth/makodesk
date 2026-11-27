"use client";
import { useEffect } from "react";
import { RotateCcw, TriangleAlert } from "lucide-react";

export default function AppError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  const digest = error instanceof Error ? (error as Error & { digest?: string }).digest : undefined;
  return (
    <section className="view active">
      <div className="panel" style={{ maxWidth: 560, margin: "40px auto" }}>
        <div className="panel-b" style={{ display: "grid", gap: 12, justifyItems: "start" }}>
          <TriangleAlert className="ico ico-lg" style={{ color: "var(--warn)" }} />
          <h2 style={{ fontSize: 20 }}>This view hit an error</h2>
          <p className="muted" style={{ margin: 0 }}>The rest of the app still works. Try again, or pick another page from the menu.</p>
          {digest && <code className="muted" style={{ fontSize: 12 }}>ref {digest}</code>}
          <button className="btn btn-primary btn-sm" onClick={() => retry()}><RotateCcw className="ico ico-sm" />Try again</button>
        </div>
      </div>
    </section>
  );
}
