export type MissionResearchProviderResult = {
  summary: string;
  sources: Array<{ title: string; url: string }>;
};

export declare function requestMissionResearch(
  mission: { name: string; intent: string; criteria: string[] },
  options: { apiKey: string; model?: string; requestId?: string; fetchImpl?: typeof fetch },
): Promise<MissionResearchProviderResult>;
