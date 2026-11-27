import type { MetadataRoute } from "next";
import { getConfig } from "@/lib/config";

export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  const { siteUrl } = getConfig();
  return { rules: [{ userAgent: "*", allow: "/", disallow: "/api/" }], sitemap: `${siteUrl}/sitemap.xml` };
}
