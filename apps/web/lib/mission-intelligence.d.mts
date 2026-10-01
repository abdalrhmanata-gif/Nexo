import type { Mission } from "./view-models";

export type IntelligencePriority = "high" | "normal";
export type NextAction = {
  currentState: string;
  nextAction: string;
  reason: string;
  blockingCondition: string | null;
  priority: IntelligencePriority;
  context: string;
  actionId: string | null;
};
export type PlanHealthFinding = {
  code: string;
  severity: "high" | "info";
  message: string;
};
export type PlanHealth = { healthy: boolean; findings: PlanHealthFinding[] };

export declare function nextActionFor(mission: Mission, now?: Date): NextAction;
export declare function planHealthFor(mission: Mission, now?: Date): PlanHealth;
export declare function missionIntelligenceFor(mission: Mission, now?: Date): {
  nextAction: NextAction;
  planHealth: PlanHealth;
};
