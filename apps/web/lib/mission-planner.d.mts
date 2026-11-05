import type { Mission } from "./view-models";

export type PlanKind = "venture" | "hiring" | "product" | "generic";

export type SuggestedPlan = {
  kind: PlanKind;
  /** True when the venture is the kind that needs a licence before a customer. */
  licensed: boolean;
  steps: string[];
  criteria: string[];
};

/** A mission that states an outcome but holds no work that would move it. */
export declare function planIsThin(mission: Mission): boolean;

/** Null when the mission says too little to propose anything useful about. */
export declare function suggestPlanFor(mission: Mission): SuggestedPlan | null;

export declare function planHeadline(kind: PlanKind): string;
