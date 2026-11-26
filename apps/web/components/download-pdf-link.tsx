import { LocalizedText } from "./localized-text";

/**
 * "Download PDF": a link to a PDF file the server makes. A real file opens
 * on every device, where the browser's print window did nothing inside the
 * in-app browsers of iPhone apps.
 */
export function DownloadPdfLink({ href }: { href: string }) {
  return <a className="button button-quiet button-small save-pdf-button" href={href} download>
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h7l5 5v13H7zM14 3v5h5M12 11v7M9 15l3 3 3-3" /></svg>
    <LocalizedText en="Download PDF" />
  </a>;
}
