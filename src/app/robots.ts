import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site-config";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: [
          "/",
          "/about",
          "/contact",
          "/terms",
          "/privacy",
          "/llms.txt",
          "/.well-known/mcp/server-card.json",
          "/api/mcp",
        ],
        disallow: [
          "/apps/",
          "/dashboard/",
          "/user-profile/",
          "/utilities/",
          "/sample-page",
          "/auth/",
          "/login",
          "/api/",
          "/monitoring",
        ],
        other: {
          "Content-Signal": "search=yes, ai-input=yes, ai-train=no",
        },
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
