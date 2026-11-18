import type { MetadataRoute } from "next";
import { SITE_URL, guides } from "../lib/guides";
import { missionTemplates } from "../lib/mission-templates";

// Public pages only. /app, /auth and /api are behind sign-in or are
// machinery; shared Mission links are unlisted on purpose and stay out.
export default function sitemap(): MetadataRoute.Sitemap {
  const fixed = ["", "/guides", "/pricing", "/templates", "/privacy", "/terms"].map((path) => ({
    url: `${SITE_URL}${path}`,
  }));
  const guidePages = guides.map((guide) => ({
    url: `${SITE_URL}/guides/${guide.slug}`,
    lastModified: guide.updated,
  }));
  const templatePages = missionTemplates.map((template) => ({ url: `${SITE_URL}/templates/${template.id}` }));
  return [...fixed, ...guidePages, ...templatePages];
}
