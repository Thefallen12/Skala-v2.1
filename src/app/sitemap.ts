import type { MetadataRoute } from "next";
import { PUBLIC_PAGES, absoluteUrl } from "@/lib/site-config";

const STATIC_LAST_MODIFIED = new Date("2026-11-17T00:00:00.000Z");

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PAGES.map((page) => ({
    url: absoluteUrl(page.path),
    lastModified: STATIC_LAST_MODIFIED,
    changeFrequency: page.changeFrequency,
    priority: page.priority,
  }));
}
