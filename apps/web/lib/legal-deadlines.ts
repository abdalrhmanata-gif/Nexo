import { GUIDE_LANGUAGES, guideBySlug, sourceUrl, type SourceKey } from "./guides";
import { addDays } from "./plan-dates.mjs";

/**
 * Deadlines the law sets, as the guides cite them. Each names the guide, the
 * step of the guide's plan it applies to (by position, so it matches the step
 * in every language), the event it counts from, the number of days, and the
 * official source. Only deadlines written in law go here: never an estimate.
 */
export const LEGAL_DEADLINES = [
  {
    id: "de-anmeldung",
    guide: "moving-to-germany-checklist",
    actionIndex: 1,
    // Bundesmeldegesetz §17(1): register within two weeks of moving into a flat.
    from: "move-in" as const,
    days: 14,
    source: "deRegistration" as SourceKey,
    rule: "Register your address within two weeks of moving in.",
  },
] as const;

export type LegalDeadline = (typeof LEGAL_DEADLINES)[number];

/**
 * The legal deadline for a step, if the step is the guide step a deadline
 * applies to, in any of the guide's languages. Matching is exact: a step the
 * person has renamed is their own and gets no automatic deadline.
 */
export function legalDeadlineForStep(title: string): LegalDeadline | null {
  const wanted = title.trim();
  for (const deadline of LEGAL_DEADLINES) {
    for (const lang of GUIDE_LANGUAGES) {
      const guide = guideBySlug(deadline.guide, lang);
      if (guide?.mission.actions[deadline.actionIndex]?.trim() === wanted) return deadline;
    }
  }
  return null;
}

export function legalDueDate(deadline: LegalDeadline, fromDate: string): string {
  return addDays(fromDate, deadline.days);
}

export function legalSourceUrl(deadline: LegalDeadline): string {
  return sourceUrl(deadline.source);
}
