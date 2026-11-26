export type ChecklistSource = { label: string; url: string };

export type ChecklistStep = {
  heading: string;
  detail: string;
  /** What to record on the step when it is done. */
  proof: string;
  source?: ChecklistSource;
};

export declare const CHECKLIST_GROUPS: readonly ["people", "clients", "finance", "property"];
export type ChecklistGroup = (typeof CHECKLIST_GROUPS)[number];

export type Checklist = {
  /** Absent for English. */
  lang?: "ar";
  /** For a checklist in another language: the English one on the same subject. */
  en?: string;
  slug: string;
  group: ChecklistGroup;
  /** The page's H1. */
  title: string;
  /** Short label for breadcrumbs, cards and the saved Mission's basis line. */
  short: string;
  /** The search result title. Under 60 characters. */
  metaTitle: string;
  /** The search result description. Under 160 characters. */
  metaDescription: string;
  /** ISO date the content was last checked. */
  updated: string;
  audience: string;
  when: string;
  intro: string[];
  steps: ChecklistStep[];
  faqs: { question: string; answer: string }[];
  /** Success criteria of the saved Mission. Its actions are the step headings. */
  criteria: string[];
  /** The saved Mission's intent. */
  intent: string;
  related: string[];
};

export type ChecklistChrome = {
  dir?: "rtl" | "ltr";
  taskTracker?: string;
  indexTitle: string;
  indexMetaTitle: string;
  indexMetaDescription: string;
  indexLead: string;
  indexNote: string;
  checklistsLabel: string;
  groupHeading: Record<ChecklistGroup, string>;
  updated: string;
  stepsCount: (count: number) => string;
  whoFor: string;
  when: string;
  steps: string;
  proofLabel: string;
  pdfButton: string;
  pdfNote: string;
  pdfWriteIn: string;
  pdfFooter: string;
  sourceLabel: string;
  faq: string;
  related: string;
  onThisPage: string;
  open: string;
  ctaTitle: string;
  ctaBody: string;
  ctaButton: string;
  ctaEdit: string;
  ctaFree: string;
  whyTitle: string;
  why: string[];
  repeatTitle: string;
  repeat: string;
  disclaimer: string;
  allChecklists: string;
};

export declare const CHECKLIST_CHROME: ChecklistChrome;
export declare const CHECKLIST_LANGUAGES: readonly ["en", "ar"];
export declare function checklistsIn(lang?: string): Checklist[];
export declare function checklistChrome(lang?: string): ChecklistChrome;
export declare function checklistLanguage(checklist: Checklist): "en" | "ar";
export declare function checklistAlternates(checklist: Checklist): Record<string, string> | null;

export declare const checklists: Checklist[];
export declare function checklistBySlug(slug: string): Checklist | null;
export declare function checklistPath(slug?: string, lang?: string): string;
export declare function checklistMission(checklist: Checklist): { name: string; intent: string; criteria: string[]; actions: string[] };
export declare function checklistMissionHref(checklist: Checklist): string;
