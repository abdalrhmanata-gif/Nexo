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

export declare const CHECKLIST_CHROME: {
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

export declare const checklists: Checklist[];
export declare function checklistBySlug(slug: string): Checklist | null;
export declare function checklistPath(slug?: string): string;
export declare function checklistMission(checklist: Checklist): { name: string; intent: string; criteria: string[]; actions: string[] };
export declare function checklistMissionHref(checklist: Checklist): string;
