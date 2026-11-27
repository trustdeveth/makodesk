import type { MetadataRoute } from "next";
import { getConfig } from "@/lib/config";

export const dynamic = "force-dynamic";

export default function sitemap(): MetadataRoute.Sitemap {
  const { siteUrl } = getConfig();
  return ["", "/app", "/app/terminal", "/app/chat", "/app/desk", "/app/swap", "/app/mood", "/app/burns", "/docs"].map(p => ({
    url: siteUrl + p,
    changeFrequency: p.startsWith("/app") ? "always" : "weekly",
    priority: p === "" ? 1 : 0.7,
  }));
}
