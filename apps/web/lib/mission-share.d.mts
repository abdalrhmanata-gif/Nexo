export type MissionShareSnapshot = {
  name: string;
  intent: string;
  criteria: string[];
  completedSteps: string[];
  /** Absent on links shared before planned steps were stored. */
  plannedSteps?: string[];
  status: string;
  progress: number;
  outcome?: { status: "COMPLETED" | "FAILED"; successScore: number; result: Record<string, string | number | boolean> };
};
export declare function publicMissionSnapshot(input: unknown): MissionShareSnapshot | null;
export declare function remixQuery(snapshot: MissionShareSnapshot): string;
export declare function shareIdOrNull(value: unknown): string | null;
export declare function shareMessage(name: unknown, url: string): string;
export declare function shareTargets(name: unknown, url: string): { id: string; label: string; href: string }[];
