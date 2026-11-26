import { checklistPath, checklists } from "../../lib/checklists.mjs";
import { COMPARE_PATH, compare } from "../../lib/compare";
import { TOOL_COMPARISONS, toolComparisonPath } from "../../lib/compare-tools.mjs";
import { guideLocale, guidePath } from "../../lib/guides";
import { buildLlmsTxt } from "../../lib/llms-txt.mjs";
import { missionTemplates } from "../../lib/mission-templates";

// /llms.txt: the site in plain Markdown for AI assistants (lib/llms-txt.mjs).
// Built once at deploy, like /robots.txt, so a crawler never wakes a function.

export const dynamic = "force-static";

export function GET() {
  const body = buildLlmsTxt({
    checklists: checklists.map((item) => ({ title: item.title, url: checklistPath(item.slug), description: item.metaDescription })),
    templates: missionTemplates.map((item) => ({ title: item.title, url: `/templates/${item.id}`, description: item.description })),
    comparisons: [
      ...TOOL_COMPARISONS.map((item) => ({ title: item.title, url: toolComparisonPath(item.slug), description: item.metaDescription })),
      { title: compare.title, url: COMPARE_PATH, description: compare.metaDescription },
    ],
    guides: guideLocale("en").guides.map((item) => ({ title: item.title, url: guidePath("en", item.slug), description: item.metaDescription })),
  });
  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
