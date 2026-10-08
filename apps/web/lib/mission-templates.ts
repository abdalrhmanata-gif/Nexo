export type MissionTemplate = {
  id: string;
  title: string;
  description: string;
  goal: string;
  category: "Personal" | "Work";
};

export const MISSION_TEMPLATES: MissionTemplate[] = [
  {
    id: "family-travel-research",
    title: "Plan a family trip",
    description: "Research options, compare them, and keep the final booking under your control.",
    goal: "Find three family-friendly hotels in Copenhagen for three nights under €600. Compare location, room suitability, and total price. Do not book or pay.",
    category: "Personal",
  },
  {
    id: "compare-purchase",
    title: "Compare a major purchase",
    description: "Turn a product search into a bounded comparison before you decide what to buy.",
    goal: "Find the best laptop for programming under €1,500. Compare performance, battery life, warranty, and total price. Do not purchase anything.",
    category: "Personal",
  },
  {
    id: "competitor-research",
    title: "Research competitors",
    description: "Create a repeatable research mission with clear criteria and evidence.",
    goal: "Research three main competitors in my market. Compare their pricing, target customers, key features, and positioning, and provide sources for each finding.",
    category: "Work",
  },
  {
    id: "lead-follow-up-plan",
    title: "Prepare lead follow-up",
    description: "Organize the work first, while keeping sending and consequential actions under approval.",
    goal: "Review my new sales leads, group them by priority, and prepare a concise follow-up plan for each. Do not send messages or change CRM records.",
    category: "Work",
  },
];

export function missionTemplateById(id: string | null | undefined) {
  return MISSION_TEMPLATES.find((template) => template.id === id) ?? null;
}
