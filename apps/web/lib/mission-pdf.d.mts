import type { PdfModel } from "./pdf-document.mjs";
export declare function missionPdfFileName(name: string, id: string): string;
export declare function missionPdfModel(
  mission: { name: string; intent: string; criteria: string[]; lifecycleStatus: string; actions: { id: string; title: string; status: string; evidenceNote?: string | null; evidenceUrl?: string | null }[] },
  dates: { targetDate: string | null; dueDates: Record<string, { dueOn: string }> } | null,
  options?: { t?: (en: string) => string; lang?: string; rtl?: boolean; madeOn?: string },
): PdfModel;
