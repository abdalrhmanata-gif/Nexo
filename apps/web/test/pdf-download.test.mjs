import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderPdf, pdfSafeText } from "../lib/pdf-document.mjs";
import { checklistPdfFileName, checklistPdfModel, checklistPdfPath } from "../lib/checklist-pdf.mjs";
import { checklists } from "../lib/checklists.mjs";
import { checklistsAr } from "../lib/checklists-ar.mjs";
import { missionPdfFileName, missionPdfModel } from "../lib/mission-pdf.mjs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url));
const fonts = { latin: read("public/fonts/NotoSans-Regular.ttf"), arabic: read("public/fonts/NotoSansArabic-Regular.ttf"), arabicBold: read("public/fonts/NotoSansArabic-Bold.ttf") };

test("every ready-made checklist, English and Arabic, becomes a real PDF file", async () => {
  for (const checklist of [...checklists, ...checklistsAr]) {
    const model = checklistPdfModel(checklist.slug);
    assert.equal(model.sections[0].items.length, checklist.steps.length, checklist.slug);
    const bytes = await renderPdf(model, fonts);
    assert.equal(Buffer.from(bytes.slice(0, 5)).toString(), "%PDF-", checklist.slug);
    assert.ok(bytes.length < 900_000, `${checklist.slug}: ${bytes.length} bytes`);
    assert.match(model.footer, /zavqera\.com/);
  }
  assert.equal(checklistPdfModel("employee-clearance-checklist").rtl, true);
  assert.equal(checklistPdfPath("employee-clearance-checklist"), "/ar/checklists/employee-clearance-checklist/pdf");
  assert.equal(checklistPdfFileName("month-end-close-checklist"), "zavqera-month-end-close-checklist.pdf");
  assert.equal(checklistPdfModel("no-such-checklist"), null);
});

test("a checklist from the workspace keeps what is done, the due dates and the proof", async () => {
  const mission = {
    name: "Close the café · 2026-11-27", intent: "Every evening.", criteria: ["Till counted"], lifecycleStatus: "RUNNING",
    actions: [
      { id: "a1", title: "Count the till", status: "COMPLETED", evidenceNote: "€412, two people", evidenceUrl: "https://example.com/till" },
      { id: "a2", title: "Lock the doors", status: "PENDING" },
      { id: "a3", title: "Dropped", status: "CANCELLED" },
    ],
  };
  const model = missionPdfModel(mission, { targetDate: "2026-11-27", dueDates: { a2: { dueOn: "2026-11-27" } } }, { madeOn: "2026-11-27" });
  const steps = model.sections.at(-1).items;
  assert.deepEqual(steps.map((step) => [step.title, Boolean(step.done)]), [["Count the till", true], ["Lock the doors", false]]);
  assert.deepEqual(steps[0].lines.map((line) => line.label), ["Proof", "Link"]);
  assert.equal(steps[1].lines[0].text, "Due 2026-11-27");
  assert.ok(model.meta.includes("Target date: 2026-11-27"));
  const bytes = await renderPdf({ ...model, rtl: true, title: "إغلاق المقهى · 2026-11-27" }, fonts);
  assert.equal(Buffer.from(bytes.slice(0, 5)).toString(), "%PDF-");
  assert.equal(missionPdfFileName("Close the café · 2026-11-27", "abc"), "zavqera-close-the-cafe-2026-11-27.pdf");
  assert.equal(missionPdfFileName("إغلاق المقهى", "1234567890"), "zavqera-12345678.pdf");
});

test("text the fonts cannot draw is replaced, and Arabic marks that crash shaping are dropped", () => {
  assert.equal(pdfSafeText("Next → step ✓"), "Next -> step");
  assert.equal(pdfSafeText("صفِّ"), "صف");
});

test("the files are served as downloads, built at build time or for a signed-in reader", () => {
  const english = readFileSync(new URL("../app/checklists/[slug]/pdf/route.ts", import.meta.url), "utf8");
  assert.match(english, /export const dynamic = "force-static";/);
  assert.match(english, /attachment; filename=/);
  const mission = readFileSync(new URL("../app/app/missions/[id]/pdf/route.ts", import.meta.url), "utf8");
  assert.match(mission, /getAuthenticatedUser\(\)/);
  assert.match(mission, /"Cache-Control": "private, no-store"/);
  assert.match(readFileSync(new URL("../next.config.mjs", import.meta.url), "utf8"), /"\/app\/missions\/\[id\]\/pdf": \["\.\/public\/fonts\/\*\.ttf"\]/);
  assert.match(readFileSync(new URL("../public/fonts/OFL.txt", import.meta.url), "utf8"), /SIL Open Font License/);
});
