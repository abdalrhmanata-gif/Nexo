import type { MetadataRoute } from "next";
import { GUIDE_LANGUAGES, SITE_URL, guideAlternates, guideLocale, guidePath } from "../lib/guides";
import { missionTemplates } from "../lib/mission-templates";
import { COMPARE_PATH, compare } from "../lib/compare";
import { CHECKLIST_LANGUAGES, checklistAlternates, checklistPath, checklistsIn } from "../lib/checklists.mjs";
import { TASK_TRACKER_LANGUAGES, taskTrackerPath } from "../lib/task-tracker.mjs";
import { TOOL_COMPARISONS, toolComparisonPath } from "../lib/compare-tools.mjs";

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
  const comparePages = [
    { url: `${SITE_URL}${toolComparisonPath()}` },
    { url: `${SITE_URL}${COMPARE_PATH}`, lastModified: compare.checked },
    ...TOOL_COMPARISONS.map((item) => ({ url: `${SITE_URL}${toolComparisonPath(item.slug)}`, lastModified: item.checked })),
  ];
  // Checklists are written per language, not translated; a checklist with a
  // counterpart in another language lists both as hreflang alternates.
  const absolute = (paths: Record<string, string> | null) =>
    paths ? { alternates: { languages: Object.fromEntries(Object.entries(paths).map(([code, path]) => [code, `${SITE_URL}${path}`])) } } : {};
  const checklistPages = CHECKLIST_LANGUAGES.flatMap((lang) => [
    { url: `${SITE_URL}${checklistPath(undefined, lang)}` },
    ...checklistsIn(lang).map((checklist) => ({ url: `${SITE_URL}${checklistPath(checklist.slug)}`, lastModified: checklist.updated, ...absolute(checklistAlternates(checklist)) })),
  ]);
  const trackerPages = TASK_TRACKER_LANGUAGES.map((lang) => ({ url: `${SITE_URL}${taskTrackerPath(lang)}` }));
  return [...fixed, ...comparePages, ...indexes, ...guidePages, ...templatePages, ...checklistPages, ...trackerPages];
}
