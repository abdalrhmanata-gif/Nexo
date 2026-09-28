import type { MissionRepository } from "./mission-repository";
import type { Mission } from "./view-models";

const localMissions: Mission[] = [
  {
    id: "launch-brief",
    version: 1,
    lifecycleStatus: "RUNNING",
    name: "Launch brief synthesis",
    intent: "Turn customer research into a decision-ready launch brief.",
    status: "ACTIVE",
    risk: "LOW",
    progress: 68,
    budget: "14 of 20 units",
    updated: "8 min ago",
    owner: "Product strategy",
    criteria: ["Cite source notes", "Separate facts from recommendations", "Flag open decisions"],
    actions: [],
    activity: [
      { label: "Checkpoint verified", detail: "Research set is within the approved scope.", time: "8 min ago" },
      { label: "Draft synthesis", detail: "Three themes were grouped for review.", time: "22 min ago" }
    ],
    verifications: [],
    outcomes: []
  },
  {
    id: "vendor-review",
    version: 1,
    lifecycleStatus: "WAITING",
    name: "Vendor security review",
    intent: "Compare two vendors against the security questionnaire.",
    status: "WAITING",
    risk: "MEDIUM",
    progress: 42,
    budget: "9 of 12 units",
    updated: "31 min ago",
    owner: "Security operations",
    criteria: ["Preserve questionnaire evidence", "Request approval before outreach", "Record unknowns"],
    actions: [],
    activity: [
      { label: "Needs user input", detail: "A missing data-retention answer needs a decision.", time: "31 min ago" },
      { label: "Evidence collected", detail: "Public documentation has been attached to the review.", time: "1 hr ago" }
    ],
    verifications: [],
    outcomes: []
  }
];

export const localMockMissionRepository: MissionRepository = {
  async listMissions() {
    return localMissions;
  },
  async getMission(id: string) {
    return localMissions.find((mission) => mission.id === id) ?? null;
  }
};
