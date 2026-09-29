import type { ActionStatus, Mission } from "./view-models";

export declare function parseMissionObjective(objective: string): {
  name: string;
  intent: string;
  criteria: string[];
};

export declare function composeMissionObjective(input: {
  name: string;
  intent: string;
  criteria: string;
}): string;

export declare function actionStatusLabel(status: ActionStatus | string): string;
export declare function actionStatusHint(status: ActionStatus | string): string;
export declare const ACTION_STATUS_ORDER: ActionStatus[];

export type MissionNextStep = {
  label: string;
  detail: string;
  tone: "done" | "attention" | "info";
};

export declare function nextStepFor(
  mission: Pick<Mission, "actions" | "verifications" | "outcomes">,
): MissionNextStep;

export declare function summariseEventPayload(payload: unknown): string;
export declare function humaniseEventType(eventType: string): string;
