export type PlanKind = "venture" | "hiring" | "product" | "generic";

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

/** A mission that states an outcome but holds no work that would move it. */
export declare function planIsThin(mission: PlannableMission): boolean;

/** Null when the mission says too little to propose anything useful about. */
export declare function suggestPlanFor(mission: PlannableMission): SuggestedPlan | null;

export declare function planHeadline(kind: PlanKind | string): string;
