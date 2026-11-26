// A PDF file of a checklist, made on the server, so "Download PDF" gives a
// real file on every device. The browser's print window, which the old
// button opened, does nothing inside the in-app browsers of iPhone apps.
//
// The layout is deliberately plain: a document people print and tick by
// hand at the restaurant counter, or keep as the record of what was done.
// Arabic is shaped by fontkit (through pdf-lib) and laid out right to left
// here, word by word; a run of Latin words inside Arabic (a brand, a date)
// keeps its own left-to-right order.

import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";

const A4 = [595.28, 841.89];
const ARABIC_DIGITS = ["\u0660", "\u0661", "\u0662", "\u0663", "\u0664", "\u0665", "\u0666", "\u0667", "\u0668", "\u0669"];
const MARGIN = 50;
const INK = rgb(0.11, 0.13, 0.15);
const MUTED = rgb(0.38, 0.42, 0.45);
const TEAL = rgb(0.043, 0.31, 0.294);
const LINE = rgb(0.82, 0.85, 0.86);

const ARABIC = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

/** Characters the fonts do not have, replaced by what reads the same. */
export function pdfSafeText(text) {
  return String(text ?? "")
    .replace(/[→⟶➜]/g, "->")
    .replace(/[←⟵]/g, "<-")
    .replace(/[✓✔☑]/g, "")
    .replace(/[\u200B-\u200F\u2066-\u2069]/g, "")
    // Arabic short vowels and the shadda: the font's mark positioning crashes
    // fontkit on some of them, and printed Arabic reads well without them.
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Split a paragraph into words, each marked Arabic or not. */
function words(text) {
  return pdfSafeText(text).split(" ").filter(Boolean).map((word) => ({ word, arabic: ARABIC.test(word) }));
}

/**
 * Lines of a paragraph that fit a width, as arrays of words. Each word keeps
 * which font draws it.
 */
function wrap(text, fonts, size, width) {
  const lines = [];
  let line = [];
  let used = 0;
  const space = fonts.latin.widthOfTextAtSize(" ", size);
  for (const item of words(text)) {
    const font = item.arabic ? fonts.arabic : fonts.latin;
    const w = font.widthOfTextAtSize(item.word, size);
    const next = line.length ? used + space + w : w;
    if (line.length && next > width) {
      lines.push(line);
      line = [{ ...item, w }];
      used = w;
    } else {
      line.push({ ...item, w });
      used = next;
    }
  }
  if (line.length) lines.push(line);
  return lines;
}

/** Draw one line, from the left (ltr) or from the right (rtl). */
function drawLine(page, line, { x, right, y, size, fonts, color, rtl }) {
  const space = fonts.latin.widthOfTextAtSize(" ", size);
  if (!rtl) {
    let cursor = x;
    for (const item of line) {
      page.drawText(item.word, { x: cursor, y, size, font: item.arabic ? fonts.arabic : fonts.latin, color });
      cursor += item.w + space;
    }
    return;
  }
  // Right to left: Arabic words go leftwards one by one; a run of other
  // words (a name, a date, a link) is placed as one block in its own order.
  const groups = [];
  for (const item of line) {
    const last = groups[groups.length - 1];
    if (!item.arabic && last && !last.arabic) last.items.push(item);
    else groups.push({ arabic: item.arabic, items: [item] });
  }
  let cursor = right;
  for (const group of groups) {
    const width = group.items.reduce((sum, item) => sum + item.w, 0) + space * (group.items.length - 1);
    let start = cursor - width;
    for (const item of group.items) {
      page.drawText(item.word, { x: start, y, size, font: item.arabic ? fonts.arabic : fonts.latin, color });
      start += item.w + space;
    }
    cursor -= width + space;
  }
}

/**
 * The PDF of a document model:
 * { lang, rtl, title, subtitle?, meta: string[], intro: string[],
 *   sections: [{ heading, items: [{ title, lines: [{ label?, text }], done? }] }],
 *   writeIn?: string (a "Done by / Date" line under every step, for paper),
 *   footer: string }
 * `fontBytes` holds { latin, arabic, arabicBold } as Uint8Array.
 */
export async function renderPdf(model, fontBytes) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(pdfSafeText(model.title));
  doc.setProducer("ZAVQERA");
  doc.setCreator("ZAVQERA · zavqera.com");
  if (model.lang) doc.setLanguage(model.lang);
  const latin = await doc.embedFont(fontBytes.latin, { subset: false });
  const arabic = await doc.embedFont(fontBytes.arabic, { subset: true });
  const arabicBold = await doc.embedFont(fontBytes.arabicBold ?? fontBytes.arabic, { subset: true });
  const body = { latin, arabic };
  const bold = { latin, arabic: arabicBold };
  const rtl = Boolean(model.rtl);
  const left = MARGIN;
  const right = A4[0] - MARGIN;
  const width = right - left;

  let page = doc.addPage(A4);
  let y = A4[1] - MARGIN;
  const pages = [page];
  const room = (needed) => {
    if (y - needed < MARGIN + 24) {
      page = doc.addPage(A4);
      pages.push(page);
      y = A4[1] - MARGIN;
    }
  };
  const paragraph = (text, { size = 10.5, fonts = body, color = INK, indent = 0, gap = 4 } = {}) => {
    const lines = wrap(text, fonts, size, width - indent);
    for (const line of lines) {
      room(size + gap);
      y -= size + gap;
      drawLine(page, line, { x: left + (rtl ? 0 : indent), right: right - (rtl ? indent : 0), y, size, fonts, color, rtl });
    }
  };

  // Brand line, title, subtitle.
  paragraph("ZAVQERA", { size: 9, color: TEAL, gap: 0 });
  y -= 8;
  paragraph(model.title, { size: 20, fonts: bold, gap: 6 });
  if (model.subtitle) paragraph(model.subtitle, { size: 11, color: MUTED });
  for (const line of model.meta ?? []) paragraph(line, { size: 9.5, color: MUTED });
  y -= 6;
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.8, color: LINE });
  y -= 6;
  for (const text of model.intro ?? []) {
    paragraph(text, { size: 10.5 });
    y -= 4;
  }

  const box = 10;
  for (const section of model.sections ?? []) {
    y -= 8;
    room(40);
    paragraph(section.heading, { size: 13, fonts: bold, color: TEAL, gap: 6 });
    y -= 2;
    section.items.forEach((item, index) => {
      room(48);
      y -= 8;
      const top = y;
      // The box to tick, drawn as lines, and its tick when the step is done.
      const boxX = rtl ? right - box : left;
      page.drawRectangle({ x: boxX, y: top - box - 3, width: box, height: box, borderColor: INK, borderWidth: 0.9 });
      if (item.done) {
        page.drawLine({ start: { x: boxX + 2, y: top - 8.5 }, end: { x: boxX + 4.2, y: top - 11 }, thickness: 1.4, color: TEAL });
        page.drawLine({ start: { x: boxX + 4.2, y: top - 11 }, end: { x: boxX + 8.5, y: top - 5 }, thickness: 1.4, color: TEAL });
      }
      const indent = box + 10;
      // In Arabic the number is written in Arabic digits, so it is shaped and
      // ordered with the words around it.
      const number = rtl ? String(index + 1).replace(/[0-9]/g, (digit) => ARABIC_DIGITS[Number(digit)]) : String(index + 1);
      paragraph(`${number}. ${item.title}`, { size: 11.5, fonts: bold, indent, gap: 3 });
      for (const line of item.lines ?? []) {
        if (!line.text) continue;
        paragraph(line.label ? `${line.label}: ${line.text}` : line.text, { size: 9.8, color: line.label ? MUTED : INK, indent, gap: 3 });
      }
      if (model.writeIn) {
        y -= 4;
        paragraph(model.writeIn, { size: 9, color: MUTED, indent, gap: 4 });
      }
    });
  }

  // Footer on every page: where it came from, and the page count.
  const footer = pdfSafeText(model.footer ?? "ZAVQERA · zavqera.com");
  pages.forEach((each, index) => {
    const label = `${footer}   ${index + 1}/${pages.length}`;
    const lines = wrap(label, body, 8, width);
    let fy = MARGIN - 18;
    for (const line of lines.slice(0, 1)) drawLine(each, line, { x: left, right, y: fy, size: 8, fonts: body, color: MUTED, rtl });
  });

  return doc.save();
}
