export const OPPORTUNITY_WEIGHTS = Object.freeze({
  strategicFit: 25,
  potentialValue: 25,
  urgency: 15,
  evidenceStrength: 20,
  executionEase: 15,
});

function rating(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 1;
  return Math.max(1, Math.min(5, Math.round(numeric)));
}

/**
 * Transparent prioritization score, not a probability or revenue forecast.
 * Ratings use a 1–5 scale; execution effort is inverted so less effort scores higher.
 */
export function scoreOpportunity(opportunity) {
  const fit = rating(opportunity?.strategicFit);
  const value = rating(opportunity?.potentialValue);
  const urgency = rating(opportunity?.urgency);
  const evidence = rating(opportunity?.evidenceStrength);
  const effort = rating(opportunity?.effort);

  const weightedTotal =
    fit * OPPORTUNITY_WEIGHTS.strategicFit +
    value * OPPORTUNITY_WEIGHTS.potentialValue +
    urgency * OPPORTUNITY_WEIGHTS.urgency +
    evidence * OPPORTUNITY_WEIGHTS.evidenceStrength +
    (6 - effort) * OPPORTUNITY_WEIGHTS.executionEase;

  return Math.round(weightedTotal / 5);
}

export function opportunityPriority(score) {
  const normalized = Number.isFinite(Number(score)) ? Number(score) : 0;
  if (normalized >= 80) return "PURSUE";
  if (normalized >= 60) return "VALIDATE";
  return "HOLD";
}

export function priorityDescription(priority) {
  switch (priority) {
    case "PURSUE":
      return "Strong candidate. Confirm the evidence and define the smallest safe next step.";
    case "VALIDATE":
      return "Potentially worthwhile. Test the weakest assumption before investing heavily.";
    default:
      return "Keep on the radar. Improve the evidence or reduce the effort before committing.";
  }
}
