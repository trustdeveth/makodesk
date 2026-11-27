import type { Metadata } from "next";
import { AppShell } from "@/components/app/AppShell";

export const metadata: Metadata = {
  title: "App",
  description: "Live desk dashboard for $MAKO: order book, desk fills, PnL, Mood Engine, swap and burn log.",
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
