import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Chat",
  description: "Live $MAKO community chat: channels, wallet-verified members and moderated rooms.",
};

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return children;
}
