export type MissionStarterLanguage = "en" | "nb" | "ar" | "es" | "fr" | "de";

export type MissionStarterExample = {
  key: "project" | "research" | "team-follow-up";
  label: string;
  goal: string;
};

export declare const MISSION_STARTER_EXAMPLES: Record<MissionStarterLanguage, MissionStarterExample[]>;
export declare function getMissionStarterExamples(language: MissionStarterLanguage | string): MissionStarterExample[];
