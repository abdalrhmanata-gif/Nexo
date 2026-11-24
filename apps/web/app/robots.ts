import type { MetadataRoute } from "next";
import { SITE_URL } from "../lib/guides";

// /robots.txt was a 404 that woke a server function for every crawler.
// /share stays crawlable: its pages carry noindex themselves, and chat apps
// fetch them to draw link previews.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/app", "/auth", "/api", "/invite", "/mcp", "/oauth"] },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
