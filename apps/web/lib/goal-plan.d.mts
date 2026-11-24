export declare const GOAL_MAX_LENGTH: number;
export declare const GOAL_MIN_LENGTH: number;

export type GoalMatch = {
  source: "guide" | "template" | "planner";
  /** Guide slug, template id, or planner kind. */
  id: string;
  /** Planner ventures only: the kind that needs a licence first. */
  licensed?: boolean;
};

export declare const GOAL_EXAMPLES: readonly { goal: string; expect: { source: GoalMatch["source"]; id: string } }[];

export declare function normaliseGoal(value: unknown): string;
export declare function matchGoal(value: unknown): GoalMatch | null;
export declare function goalTitle(value: unknown): string;
