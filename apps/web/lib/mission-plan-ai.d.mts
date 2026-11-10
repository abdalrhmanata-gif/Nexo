export const MAX_PLAN_REQUEST_BYTES: number;
export const MAX_PLAN_REPORT_CHARS: number;
export const MAX_PLAN_STEPS: number;

export type MissionPlanRequest = {
  name: string;
  intent: string;
  existingCriteria: string[];
  existingActions: string[];
  language: string;
};

export type MissionPlanStep = {
  step: string;
  why: string;
  /** The kind of official source to confirm an external fact with, never a link. */
  checkWith: string | null;
};

export type MissionPlanReport = {
  understanding: string;
  steps: MissionPlanStep[];
  successCriteria: string[];
  unknowns: string[];
  cautions: string[];
};

export function normalizeMissionPlanRequest(value: unknown): MissionPlanRequest;
export function buildMissionPlanPrompt(input: MissionPlanRequest): { system: string; user: string };
export function validateMissionPlanReport(value: unknown): MissionPlanReport;
export declare const REQUESTED_PLAN_STEPS: number;
