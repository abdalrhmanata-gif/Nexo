export function buildMockMissionPlan(goal) {
  const cleaned = String(goal).trim().slice(0, 600);
  return {
    summary: `Preview plan for: ${cleaned}`,
    steps: [
      { title: "Clarify the desired outcome", reason: "Turn the goal into a concrete result that can be checked." },
      { title: "Gather the required information", reason: "Collect only the inputs needed to make the next decision safely." },
      { title: "Take the first reversible action", reason: "Start with a small step that can be reviewed before committing further." },
    ],
  };
}
