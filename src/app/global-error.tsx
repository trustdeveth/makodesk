"use client";

/** Last-resort boundary: replaces the root layout, so it carries its own document and styles. */
export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100vh", display: "grid", placeItems: "center", background: "#010608", color: "#fff", fontFamily: "system-ui, sans-serif" }}>
        <title>Something went wrong · Mako Desk</title>
        <div style={{ textAlign: "center", padding: 24 }}>
          <h1 style={{ fontSize: 22, margin: "0 0 8px" }}>Something went wrong</h1>
          <p style={{ color: "#93b3bb", margin: "0 0 20px" }}>Please try again. If it keeps happening, reload the page.</p>
          <button onClick={() => retry()} style={{ height: 40, padding: "0 18px", borderRadius: 10, border: 0, background: "#34b7dd", color: "#04181c", fontWeight: 600, cursor: "pointer" }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
