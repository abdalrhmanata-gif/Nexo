// The PDF of a ready-made checklist: the same steps and proof as its page,
// with a box to tick and a "Done by / Date" line under every step, for the
// teams that print it. The footer says where to keep the record instead.

import { checklistBySlug, checklistChrome, checklistLanguage, checklistPath } from "./checklists.mjs";

/** The address of a checklist's PDF. */
export function checklistPdfPath(slug) {
  return `${checklistPath(slug)}/pdf`;
}

/** The file name offered for download: ASCII, from the slug. */
export function checklistPdfFileName(slug) {
  return `zavqera-${String(slug).replace(/[^a-z0-9-]/g, "")}.pdf`;
}

/** The document model for lib/pdf-document.mjs, or null for an unknown slug. */
export function checklistPdfModel(slug) {
  const checklist = checklistBySlug(slug);
  if (!checklist) return null;
  const lang = checklistLanguage(checklist);
  const chrome = checklistChrome(lang);
  return {
    lang,
    rtl: chrome.dir === "rtl",
    title: checklist.title,
    meta: [`${chrome.whoFor}: ${checklist.audience}`, `${chrome.when}: ${checklist.when}`],
    intro: checklist.intro.slice(0, 1),
    sections: [{
      heading: chrome.steps,
      items: checklist.steps.map((step) => ({
        title: step.heading,
        lines: [{ text: step.detail }, { label: chrome.proofLabel, text: step.proof }],
      })),
    }],
    writeIn: chrome.pdfWriteIn,
    footer: `${chrome.pdfFooter}${checklistPath(slug)}`,
  };
}
