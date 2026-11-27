"use client";
import { Copy } from "lucide-react";
import { useToast } from "@/components/providers/ToastProvider";

export function CopyButton({ text, label = "Copy", className = "", emptyMsg = "Address published at launch" }: {
  text: string; label?: string; className?: string; emptyMsg?: string;
}) {
  const toast = useToast();
  return (
    <button
      className={className}
      onClick={() => {
        if (!text) return toast(emptyMsg, "info");
        navigator.clipboard?.writeText(text).then(() => toast("Copied to clipboard", "check"), () => toast(text));
      }}
    >
      <Copy className="ico ico-sm" />{label}
    </button>
  );
}
