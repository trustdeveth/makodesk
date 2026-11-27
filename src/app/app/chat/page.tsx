"use client";
import { ChatPanel } from "@/components/chat/ChatPanel";

export default function ChatPage() {
  return (
    <section className="view active chat-page">
      <ChatPanel variant="full" initialRoom="general" />
    </section>
  );
}
