export function buildMockMissionPlan(goal) {
  const cleaned = String(goal).trim().slice(0, 600);
  return {
    title: cleaned.slice(0, 80) || "Mission draft",
    summary: `Draft outcome for: ${cleaned}`,
    successCriteria: [
      "The desired outcome is clearly defined and reviewable.",
    ],
    steps: [
      { title: "Define the concrete outcome", reason: "Turn the goal into a result that can be checked." },
      { title: "Identify the first required input", reason: "Find the smallest missing piece needed to make a safe next decision." },
      { title: "Take the first reversible step", reason: "Start with a small action that can be reviewed before committing further." },
    ],
    clarifyingQuestions: [
      "What deadline or target date should this mission work toward?",
    ],
  };
}
