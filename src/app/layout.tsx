import type { Metadata, Viewport } from "next";
import { Archivo, DM_Sans, Geist_Mono } from "next/font/google";
import { getConfig } from "@/lib/config";
import { ConfigProvider } from "@/components/providers/ConfigProvider";
import { LiveProvider } from "@/components/providers/LiveProvider";
import { ToastProvider } from "@/components/providers/ToastProvider";
import "@/styles/base.css";
import "@/styles/landing.css";
import "@/styles/app.css";
import "@/styles/docs.css";
import "@/styles/experience.css";

// Config is read from process.env at request time, so .env edits apply after a restart (no rebuild).
export const dynamic = "force-dynamic";

const dm = DM_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-dm", display: "swap" });
const mono = Geist_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-geist-mono", display: "swap" });
const archivo = Archivo({ subsets: ["latin"], axes: ["wdth"], variable: "--font-archivo", display: "swap" });

export async function generateMetadata(): Promise<Metadata> {
  const cfg = getConfig();
  return {
    metadataBase: new URL(cfg.siteUrl),
    title: { default: "Mako Desk · Read the book. Make the market. Burn the profit.", template: "%s · Mako Desk" },
    description: "$MAKO is the first memecoin with its own on-chain trading desk. Native to Elysium, it reads Hyperliquid order books, makes markets on HyperCore, and burns the profit.",
    openGraph: {
      title: "Mako Desk · The memecoin that makes markets",
      description: "Read the book. Make the market. Burn the profit. Native to Elysium.",
      url: cfg.siteUrl,
      siteName: "Mako Desk",
      type: "website",
    },
    twitter: { card: "summary_large_image", site: "@makodesk" },
  };
}

export const viewport: Viewport = { themeColor: "#010608", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const cfg = getConfig();
  return (
    <html lang="en" className={`${dm.variable} ${mono.variable} ${archivo.variable}`}>
      <body>
        <ConfigProvider value={cfg}>
          <ToastProvider>
            <LiveProvider>{children}</LiveProvider>
          </ToastProvider>
        </ConfigProvider>
      </body>
    </html>
  );
}
