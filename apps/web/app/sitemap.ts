import type { MetadataRoute } from "next";
import { GUIDE_LANGUAGES, SITE_URL, guideAlternates, guideLocale, guidePath } from "../lib/guides";
import { missionTemplates } from "../lib/mission-templates";
import { COMPARE_PATH, compare } from "../lib/compare";
import { checklistPath, checklists } from "../lib/checklists.mjs";

// Public pages only. /app, /auth and /api are behind sign-in or are
// machinery; shared Mission links are unlisted on purpose and stay out.
// Each guide is listed once per language, with its hreflang alternates.
export default function sitemap(): MetadataRoute.Sitemap {
  const fixed = ["", "/try", "/pricing", "/templates", "/ai", "/privacy", "/terms"].map((path) => ({ url: `${SITE_URL}${path}` }));
  const indexes = GUIDE_LANGUAGES.map((lang) => ({
    url: `${SITE_URL}${guidePath(lang)}`,
    alternates: { languages: guideAlternates() },
  }));
  const guidePages = GUIDE_LANGUAGES.flatMap((lang) => guideLocale(lang).guides.map((guide) => ({
    url: `${SITE_URL}${guidePath(lang, guide.slug)}`,
    lastModified: guide.updated,
    alternates: { languages: guideAlternates(guide.slug) },
  })));
  const templatePages = missionTemplates.map((template) => ({ url: `${SITE_URL}/templates/${template.id}` }));
  const comparePage = { url: `${SITE_URL}${COMPARE_PATH}`, lastModified: compare.checked };
  const checklistPages = [
    { url: `${SITE_URL}${checklistPath()}` },
    ...checklists.map((checklist) => ({ url: `${SITE_URL}${checklistPath(checklist.slug)}`, lastModified: checklist.updated })),
  ];
  return [...fixed, comparePage, ...indexes, ...guidePages, ...templatePages, ...checklistPages];
}
