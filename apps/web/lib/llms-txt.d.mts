export type LlmsLink = { title: string; url: string; description?: string };
export declare const SOURCE_URL: string;
export declare function pricingSentence(): string;
export declare function buildLlmsTxt(lists?: {
  checklists?: LlmsLink[];
  templates?: LlmsLink[];
  comparisons?: LlmsLink[];
  guides?: LlmsLink[];
}): string;
