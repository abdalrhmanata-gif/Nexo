"use client";

import { useCallback } from "react";
import { LocalizedDateTime, LocalizedText, useTranslate } from "./localized-text";

// One way to take a page of ZAVQERA away as a document.
//
// It uses the browser's own "Save as PDF" rather than a PDF library, for
// reasons that matter to the reader: the text stays selectable and
// searchable, Arabic is shaped and laid out right-to-left by the same engine
// that draws the page (PDF libraries get this wrong), and nothing is sent
// anywhere — the document is made on the reader's device from what is
// already on their screen.
//
// The print stylesheet in globals.css does the work: it removes the
// navigation and every control, and sets the page as a document. This
// component adds the two things a stylesheet cannot — a document header that
// exists only on paper, and a light theme for the moment of printing, since a
// dark page printed is a page of black ink.
export function SavePdfButton({ title, subtitle }: { title: string; subtitle?: string }) {
  const t = useTranslate();

  const save = useCallback(() => {
    const root = document.documentElement;
    const theme = root.getAttribute("data-theme");
    const pageTitle = document.title;
    const restore = () => {
      if (theme === null) root.removeAttribute("data-theme"); else root.setAttribute("data-theme", theme);
      document.title = pageTitle;
      window.removeEventListener("afterprint", restore);
    };
    window.addEventListener("afterprint", restore);
    root.setAttribute("data-theme", "light");
    // The browser offers the page title as the file name.
    document.title = `ZAVQERA — ${title}`;
    window.print();
    // Browsers that do not fire afterprint still get their page back.
    window.setTimeout(restore, 60_000);
  }, [title]);

  return <>
    <div className="print-only print-header">
      <div className="print-brand">ZAVQERA</div>
      <div className="print-title">{title}</div>
      {subtitle && <div className="print-subtitle">{subtitle}</div>}
      <div className="print-date"><LocalizedDateTime value={new Date().toISOString()} /></div>
    </div>
    <button className="button button-quiet button-small save-pdf-button" type="button" onClick={save} title={t("Opens your browser's print window. Choose “Save as PDF” as the printer.")}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6" /></svg>
      <LocalizedText en="Save as PDF" />
    </button>
  </>;
}
