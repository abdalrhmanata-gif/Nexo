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
    description: "Map your market, compare competitors and pick the opportunities worth testing, with every claim backed by evidence.",
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
    shareTitle: "Find your next growth opportunity",
    shareDescription: "Set the goal and what success looks like. Zavqera turns it into a clear plan you can review step by step.",
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
  // Everyday missions, not only business ones. Their text is translated in
  // lib/i18n.ts like every other template, so opening one in any language
  // costs no AI generation. None of them states a rule, fee or deadline:
  // those differ by country and are confirmed on the official site.
  {
    id: "settle-new-country",
    title: "Settle in a new country",
    description: "Get the essentials done after a move, one checked step at a time, with the proof saved on each step.",
    intent: "Get the essentials in place after moving to a new country, confirming every rule, fee and deadline on the official website instead of guessing.",
    criteria: [
      "Every registration the country requires is listed with its official source",
      "Each finished step has its confirmation or receipt saved as proof",
      "No step is left waiting without a date to check back",
    ],
    actions: [
      "List the registrations required and the official website for each",
      "Register your address and get an identity number if the country requires one",
      "Open a bank account and get a local phone number",
      "Register with a doctor or the public health service",
      "Find out how your qualifications or driving licence are recognised",
    ],
  },
  {
    id: "find-a-job",
    title: "Find a new job",
    description: "Turn a job search into a weekly plan you can track, from target role to signed offer.",
    intent: "Find a job that fits my skills by applying steadily and keeping track of every application, reply and interview.",
    criteria: [
      "A target role and at least ten matching openings are listed",
      "The CV and cover letter are tailored to that role",
      "At least five applications are sent, each with its confirmation saved",
    ],
    actions: [
      "Choose the target role, location and minimum pay",
      "Update the CV and write a cover letter you can adapt",
      "Find ten openings and note each deadline",
      "Send at least five applications and save each confirmation",
      "Prepare and practise answers to common interview questions",
    ],
  },
  {
    id: "organise-an-event",
    title: "Organise an event",
    description: "Plan a party, wedding or meeting with the budget, bookings and replies in one place.",
    intent: "Organise the event within budget, with every booking confirmed in writing and every guest invited on time.",
    criteria: [
      "The date, budget and number of guests are fixed",
      "The venue and every supplier are booked with written confirmation",
      "Every guest has been invited and the replies are counted",
    ],
    actions: [
      "Set the date, budget and guest count",
      "Compare three venues and book one",
      "Book catering and any other suppliers",
      "Send the invitations and track the replies",
      "Confirm every booking one week before",
    ],
  },
];

export function missionTemplateById(id: string) {
  return missionTemplates.find((template) => template.id === id) ?? null;
}
