import type { Mission } from "./view-models";

export type Attention = {
  /** Zero when the mission needs nobody — finished, or nothing stuck. */
  score: number;
  /** The single strongest reason, or null when the score is zero. */
  reason: string | null;
};

export type RankedMission = {
  mission: Mission;
  score: number;
  reason: string | null;
};

export declare function attentionFor(mission: Mission, now?: number): Attention;

/** Missions that need a person, most stuck first. Ties keep the input order. */
export declare function rankByAttention(missions: Mission[], now?: number): RankedMission[];
