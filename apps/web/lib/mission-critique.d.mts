import type { Mission } from "./view-models";

export type CritiqueSeverity = "high" | "info";

export type CritiqueFinding = {
  code: string;
  severity: CritiqueSeverity;
  /** English source text, with {text} where the quotation belongs. */
  message: string;
  /** The user's own words this finding is about, or null when it is general. */
  quote: string | null;
};

/** What is wrong with the words this mission was written in. Strongest first. */
export declare function critiqueMission(mission: Mission): CritiqueFinding[];

/**
 * True when a mission holds no work that would move it — including a step that
 * only repeats the goal or a success criterion.
 */
export declare function planIsThin(mission: Mission): boolean;
