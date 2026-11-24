export type PlanKind = "venture" | "travel" | "move" | "study" | "hiring" | "product" | "generic";

/**
 * What the planner actually reads. Narrower than Mission on purpose: the new
 * mission form calls it with a half-typed draft that has no id, no status and
 * no saved actions yet.
 */
export type PlannableMission = {
  name?: string;
  intent?: string;
  criteria?: string[];
  actions?: { title: string; status: string }[];
};

export type SuggestedPlan = {
  kind: PlanKind;
  /** True when the venture is the kind that needs a licence before a customer. */
  licensed: boolean;
  steps: string[];
  criteria: string[];
};

/** Null when the mission says too little to propose anything useful about. */
export declare function suggestPlanFor(mission: PlannableMission): SuggestedPlan | null;

export declare function planHeadline(kind: PlanKind | string): string;

/** How strongly the planner recognises a mission; zero means generic. */
export declare function planScoreFor(mission: PlannableMission): number;

/** The plan for a kind the caller already settled on. */
export declare function planOfKind(kind: PlanKind | string, options?: { licensed?: boolean }): SuggestedPlan;

/** True when a venture plan should lead with the licence. */
export declare function needsLicence(text: string): boolean;

/** The planner's keyword reading: 0 for no match, 2 for an exact word, more for several. */
export declare function matchStrength(text: string, keywords: readonly string[]): number;
