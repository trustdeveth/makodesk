import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, textAlign: "center" }}>
      <div>
        <h1 className="mega-2">404.</h1>
        <p style={{ marginTop: 16, fontSize: 18 }}>This page swam off. The desk is still quoting.</p>
        <Link className="btn btn-primary btn-lg" href="/" style={{ marginTop: 28 }}><ArrowLeft className="ico ico-sm" />Back home</Link>
      </div>
    </main>
  );
}
