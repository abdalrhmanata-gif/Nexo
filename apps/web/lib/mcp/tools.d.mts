import type { McpToolResult } from "./protocol.mjs";
import type { Mission, MissionAction } from "../view-models";
import type { DueDate } from "../plan-dates.mjs";

export type McpMissionDates = { targetDate: string | null; dueDates: Record<string, DueDate> };
export type McpTemplate = { id: string; title: string; description: string; intent: string; criteria: string[]; actions: string[] };
export type McpStepChange = { actionId: string; expectedVersion: number; evidenceNote?: string | null; evidenceUrl?: string | null; missionId: string };

/** Everything the tools need from the person's workspace. Every call runs with their own token. */
export type McpApi = {
  templates: McpTemplate[];
  listMissions(): Promise<Mission[]>;
  getMission(id: string): Promise<Mission | null>;
  datesFor(missionIds: string[]): Promise<Record<string, McpMissionDates>>;
  findRecentMission(objective: string, withinMinutes: number): Promise<string | null>;
  createMission(input: { objective: string; actions: string[] }): Promise<Mission>;
  addSteps(missionId: string, titles: string[]): Promise<MissionAction[]>;
  completeStep(input: McpStepChange): Promise<unknown>;
  setStepProof(input: McpStepChange): Promise<unknown>;
  updateStepStatus(input: { actionId: string; status: string; expectedVersion: number; missionId: string }): Promise<unknown>;
  setTargetDate(missionId: string, date: string | null): Promise<void>;
  setStepDates(missionId: string, changes: { actionId: string; dueOn: string | null; basis: "law" | null }[]): Promise<void>;
  shareMission(mission: Mission): Promise<string | null>;
};
export type McpToolContext = { api: McpApi; origin: string; today: string };

export declare const TOOL_SCOPES: readonly string[];
export declare const BOUNDS: Readonly<Record<string, number>>;
export declare const TOOLS: { name: string; title: string; description: string; inputSchema: Record<string, unknown>; annotations: Record<string, unknown> }[];
export declare function toolDescriptors(): Record<string, unknown>[];
export declare function callTool(name: string, args: Record<string, unknown>, context: McpToolContext): Promise<McpToolResult | null>;
export declare class InvalidInput extends Error {}
