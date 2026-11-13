import { isPortableEvidence, isPortableOpportunity } from "./opportunity-portability.mjs";

// Opportunities are stored in the signed-in person's account. This module is
// the pure part of that: how a record maps to a stored row and back, and what
// a browser still holds from the time when the browser was the only store.
//
// No row built here names its owner. The database takes the owner from the
// session; a row that carried a user id would be a request to write into a
// named account, and row level security exists to refuse exactly that.

/** The key the page used when the browser was the only store. Read, never written. */
export const BROWSER_OPPORTUNITY_KEY = "zavqera.opportunity-intelligence.v1";
/**
 * Set once this browser's records have been sent to an account. Without it,
 * every visit would send them again — and an opportunity the person had since
 * removed from their account would come back from the browser's old copy.
 */
export const BROWSER_UPLOAD_MARKER_KEY = "zavqera.opportunity-intelligence.v1.uploaded";

export function opportunityToRow(opportunity) {
  return {
    id: opportunity.id,
    title: opportunity.title,
    target: opportunity.target,
    thesis: opportunity.thesis,
    evidence_url: opportunity.evidenceUrl,
    strategic_fit: opportunity.strategicFit,
    potential_value: opportunity.potentialValue,
    urgency: opportunity.urgency,
    evidence_strength: opportunity.evidenceStrength,
    effort: opportunity.effort,
    created_at_ms: Math.round(opportunity.createdAt),
  };
}

export function evidenceToRow(opportunityId, item) {
  return {
    opportunity_id: opportunityId,
    id: item.id,
    url: item.url,
    title: item.title,
    observation: item.observation,
    stance: item.stance,
    source_type: item.sourceType,
    source_date: item.sourceDate,
    reliability: item.reliability,
    checked_at: item.checkedAt,
    added_at_ms: Math.round(item.addedAt),
  };
}

function evidenceFromRow(row) {
  return {
    id: row.id,
    url: row.url,
    title: row.title,
    observation: row.observation,
    stance: row.stance,
    sourceType: row.source_type,
    sourceDate: row.source_date,
    reliability: Number(row.reliability),
    checkedAt: row.checked_at,
    addedAt: Number(row.added_at_ms),
  };
}

/** Stored rows, each with its evidence rows nested, back to the page's shape. */
export function opportunitiesFromRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    target: row.target,
    thesis: row.thesis,
    evidenceUrl: row.evidence_url,
    evidenceItems: (Array.isArray(row.opportunity_evidence_items) ? row.opportunity_evidence_items : [])
      .map(evidenceFromRow)
      .sort((a, b) => a.addedAt - b.addedAt),
    strategicFit: Number(row.strategic_fit),
    potentialValue: Number(row.potential_value),
    urgency: Number(row.urgency),
    evidenceStrength: Number(row.evidence_strength),
    effort: Number(row.effort),
    createdAt: Number(row.created_at_ms),
  }));
}

/** The browser's stored text as a list, or an empty list if it is anything else. */
export function readBrowserOpportunities(raw) {
  if (typeof raw !== "string" || !raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Decide what this browser holds that the account does not.
 *
 * An opportunity the account already has is left alone — the account's copy
 * stands. Its evidence notes are compared one by one, so an upload that was
 * cut off after the opportunities and before the evidence is finished by the
 * next attempt. A record the database would refuse is counted in
 * leftBehindCount and stays in the browser rather than failing the whole
 * upload. The browser's own copy is never modified here.
 */
export function planBrowserUpload(browserOpportunities, accountOpportunities) {
  const plan = { opportunityRows: [], evidenceRows: [], leftBehindCount: 0 };
  if (!Array.isArray(browserOpportunities)) return plan;

  /** Opportunity id → the evidence ids already stored or already planned. */
  const held = new Map();
  for (const item of Array.isArray(accountOpportunities) ? accountOpportunities : []) {
    if (typeof item?.id !== "string") continue;
    held.set(item.id, new Set((Array.isArray(item.evidenceItems) ? item.evidenceItems : []).map((evidence) => evidence?.id)));
  }

  for (const candidate of browserOpportunities) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      plan.leftBehindCount += 1;
      continue;
    }
    const evidenceItems = (Array.isArray(candidate.evidenceItems) ? candidate.evidenceItems : []).filter(isPortableEvidence);
    const opportunity = { ...candidate, evidenceItems };
    if (!isPortableOpportunity(opportunity)) {
      plan.leftBehindCount += 1;
      continue;
    }
    let evidenceIds = held.get(opportunity.id);
    if (!evidenceIds) {
      evidenceIds = new Set();
      held.set(opportunity.id, evidenceIds);
      plan.opportunityRows.push(opportunityToRow(opportunity));
    }
    for (const item of evidenceItems) {
      if (evidenceIds.has(item.id)) continue;
      evidenceIds.add(item.id);
      plan.evidenceRows.push(evidenceToRow(opportunity.id, item));
    }
  }
  return plan;
}
