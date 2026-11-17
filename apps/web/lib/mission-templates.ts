export type MissionTemplate = {
  id: string;
  title: string;
  description: string;
  intent: string;
  criteria: string[];
  actions: string[];
  featured?: boolean;
  shareTitle?: string;
  shareDescription?: string;
};

export const missionTemplates: MissionTemplate[] = [
  {
    id: "business-opportunity-scan",
    title: "Find growth opportunities",
    description: "Give AI a bounded business mission: research the market, compare competitors, and surface practical opportunities.",
    intent: "Find the strongest growth opportunities for my business using current public evidence, while keeping the research bounded and the recommendations reviewable.",
    criteria: [
      "Identify at least five relevant competitors or alternatives",
      "Surface at least three evidence-backed opportunities",
      "Separate observations from assumptions and recommend the next test",
    ],
    actions: [
      "Define the business, target customer, and decision to support",
      "Research competitors, alternatives, and current market signals",
      "Compare the evidence and identify the strongest opportunities",
      "Propose one small, reversible next test",
    ],
    featured: true,
    shareTitle: "Give AI a real business mission",
    shareDescription: "Set the goal, limits, and success criteria. Then see how Zavqera turns the mission into a reviewable plan.",
  },
  {
    id: "launch-plan",
    title: "Launch a small project",
    description: "Turn an idea into a bounded launch plan with clear milestones.",
    intent: "Prepare and validate a small project launch while keeping cost, timing, and risk visible.",
    criteria: ["Define the target audience and outcome", "Validate demand with credible evidence", "Create a milestone plan and budget"],
    actions: ["Describe the target user and problem", "Collect evidence for demand", "Draft milestones, costs, and risks"],
  },
  {
    id: "research-decision",
    title: "Make an evidence-based decision",
    description: "Compare options, preserve uncertainty, and document the decision.",
    intent: "Compare realistic options using trustworthy evidence and make a decision with assumptions and uncertainties clearly stated.",
    criteria: ["Identify at least two realistic options", "Record supporting and contradictory evidence", "Document a decision and remaining unknowns"],
    actions: ["Define the decision and constraints", "Collect primary or authoritative sources", "Compare options and record open questions"],
  },
  {
    id: "weekly-operations",
    title: "Improve a weekly workflow",
    description: "Find friction in recurring work and measure a safe improvement.",
    intent: "Improve one recurring workflow without disrupting critical operations, and confirm whether the change helped.",
    criteria: ["Describe the current workflow and baseline", "Test one reversible improvement", "Compare the outcome with the baseline"],
    actions: ["Map the current steps and bottlenecks", "Choose a small reversible change", "Review results and decide whether to keep it"],
  },
];

export function missionTemplateById(id: string) {
  return missionTemplates.find((template) => template.id === id) ?? null;
}
