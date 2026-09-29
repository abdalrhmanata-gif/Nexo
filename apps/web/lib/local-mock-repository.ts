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
    progress: 33,
    actionsTotal: 3,
    actionsCompleted: 1,
    updated: "8 min ago",
    owner: "Product strategy",
    criteria: ["Cite source notes", "Separate facts from recommendations", "Flag open decisions"],
    actions: [
      { id: "launch-brief-1", title: "Group research notes by theme", status: "COMPLETED", version: 1 },
      { id: "launch-brief-2", title: "Draft the decision summary", status: "RUNNING", version: 1 },
      { id: "launch-brief-3", title: "Flag the open pricing decision", status: "PENDING", version: 1 },
    ],
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
    progress: 50,
    actionsTotal: 2,
    actionsCompleted: 1,
    updated: "31 min ago",
    owner: "Security operations",
    criteria: ["Preserve questionnaire evidence", "Request approval before outreach", "Record unknowns"],
    actions: [
      { id: "vendor-review-1", title: "Collect public security documentation", status: "COMPLETED", version: 1 },
      { id: "vendor-review-2", title: "Confirm the data-retention answer", status: "BLOCKED", version: 1 },
    ],
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
