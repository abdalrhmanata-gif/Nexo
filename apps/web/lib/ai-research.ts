export type MissionResearchSource = { title: string; url: string };

export type MissionResearch = { summary: string; sources: MissionResearchSource[] };

export function buildMockMissionResearch(mission: { name: string; intent: string; criteria: string[] }): MissionResearch {
  return {
    summary: `Test research for “${mission.name}”: the mission is bounded to read-only research, and no external action is taken. The saved result remains unverified until a user records verification evidence.`,
    sources: [{ title: "ZAVQERA test source", url: "https://example.com/" }],
  };
}

export { requestMissionResearch } from "./ai-research-provider.mjs";
