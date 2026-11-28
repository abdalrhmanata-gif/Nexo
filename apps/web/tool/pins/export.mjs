// Prints every free checklist (all languages) as JSON for make_pins.py.
// Run from apps/web: node tool/pins/export.mjs > /tmp/pins.json
import { checklistPath, checklistsIn } from "../../lib/checklists.mjs";

const out = [];
for (const lang of ["en", "ar", "es", "fr", "de", "nb"]) {
  for (const c of checklistsIn(lang)) {
    out.push({ lang, slug: c.slug, title: c.title, metaTitle: c.metaTitle, metaDescription: c.metaDescription, steps: c.steps.map((s) => s.heading), path: checklistPath(c.slug, lang) });
  }
}
process.stdout.write(JSON.stringify(out, null, 1));
