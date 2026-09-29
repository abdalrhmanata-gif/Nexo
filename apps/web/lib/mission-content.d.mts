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

export declare function allowedNextStatuses(from: ActionStatus | string): ActionStatus[];
export declare function isActionTransitionAllowed(from: ActionStatus | string, to: ActionStatus | string): boolean;
export declare function isTerminalActionStatus(status: ActionStatus | string): boolean;
export declare function supportsFollowUp(status: ActionStatus | string): boolean;

export type FollowUpDisplay = {
  absolute: string;
  relative: string;
  overdue: boolean;
};

export declare function formatFollowUp(value: string | null | undefined, now?: Date): FollowUpDisplay | null;
export declare function followUpInputValue(value: string | null | undefined): string;
