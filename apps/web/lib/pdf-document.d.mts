export type PdfLine = { label?: string; text: string };
export type PdfItem = { title: string; lines?: PdfLine[]; done?: boolean };
export type PdfModel = {
  lang?: string;
  rtl?: boolean;
  title: string;
  subtitle?: string;
  meta?: string[];
  intro?: string[];
  sections?: { heading: string; items: PdfItem[] }[];
  writeIn?: string;
  footer?: string;
};
export declare function pdfSafeText(text: unknown): string;
export declare function renderPdf(model: PdfModel, fontBytes: { latin: Uint8Array; arabic: Uint8Array; arabicBold?: Uint8Array }): Promise<Uint8Array>;
