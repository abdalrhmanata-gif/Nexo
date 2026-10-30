import { isHttpSourceUrl, isOpportunityEvidenceItem } from "./evidence-ledger.mjs";

export const OPPORTUNITY_BACKUP_FORMAT = "zavqera-opportunity-intelligence";
export const OPPORTUNITY_BACKUP_VERSION = 1;
export const MAX_OPPORTUNITY_BACKUP_BYTES = 2 * 1024 * 1024;
export const MAX_IMPORTED_OPPORTUNITIES = 1000;
export const MAX_EVIDENCE_ITEMS_PER_OPPORTUNITY = 200;

const TEXT_LIMITS = Object.freeze({
  id: 128,
  title: 100,
  target: 160,
  thesis: 1200,
  evidenceUrl: 500,
});

function isText(value, maxLength, { required = false } = {}) {
  return typeof value === "string"
    && value.length <= maxLength
    && (!required || value.trim().length > 0);
}

function isRating(value) {
  return Number.isInteger(value) && value >= 1 && value <= 5;
}

function isPortableEvidence(value) {
  return isOpportunityEvidenceItem(value)
    && isText(value.id, 128, { required: true })
    && isText(value.url, 500, { required: true })
    && isText(value.title, 180, { required: true })
    && isText(value.observation, 1200, { required: true })
    && isText(value.sourceDate, 50)
    && isText(value.checkedAt, 100, { required: true })
    && Number.isFinite(Date.parse(value.checkedAt))
    && Number.isFinite(value.addedAt)
    && value.addedAt >= 0;
}

function portableOpportunity(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value;
  if (!isText(item.id, TEXT_LIMITS.id, { required: true })) return false;
  if (!isText(item.title, TEXT_LIMITS.title, { required: true })) return false;
  if (!isText(item.target, TEXT_LIMITS.target)) return false;
  if (!isText(item.thesis, TEXT_LIMITS.thesis, { required: true })) return false;
  if (!isText(item.evidenceUrl, TEXT_LIMITS.evidenceUrl)) return false;
  if (item.evidenceUrl && !isHttpSourceUrl(item.evidenceUrl)) return false;
  if (!["strategicFit", "potentialValue", "urgency", "evidenceStrength", "effort"].every((key) => isRating(item[key]))) return false;
  if (!Number.isFinite(item.createdAt) || item.createdAt < 0) return false;
  if (!Array.isArray(item.evidenceItems) || item.evidenceItems.length > MAX_EVIDENCE_ITEMS_PER_OPPORTUNITY) return false;
  return item.evidenceItems.every(isPortableEvidence);
}

function projectOpportunity(item) {
  return {
    id: item.id,
    title: item.title,
    target: item.target,
    thesis: item.thesis,
    evidenceUrl: item.evidenceUrl,
    evidenceItems: item.evidenceItems.map((evidence) => ({
      id: evidence.id,
      url: evidence.url,
      title: evidence.title,
      observation: evidence.observation,
      stance: evidence.stance,
      sourceType: evidence.sourceType,
      sourceDate: evidence.sourceDate,
      reliability: evidence.reliability,
      checkedAt: evidence.checkedAt,
      addedAt: evidence.addedAt,
    })),
    strategicFit: item.strategicFit,
    potentialValue: item.potentialValue,
    urgency: item.urgency,
    evidenceStrength: item.evidenceStrength,
    effort: item.effort,
    createdAt: item.createdAt,
  };
}

export function createOpportunityBackup(opportunities, exportedAt = new Date().toISOString()) {
  if (!Array.isArray(opportunities)) throw new Error("There are no valid opportunities to export.");
  if (opportunities.length > MAX_IMPORTED_OPPORTUNITIES) {
    throw new Error(`A backup can contain at most ${MAX_IMPORTED_OPPORTUNITIES} opportunities.`);
  }
  if (!Number.isFinite(Date.parse(exportedAt))) throw new Error("The export timestamp is invalid.");
  const ids = new Set();
  const projected = opportunities.map((item) => {
    if (!portableOpportunity(item)) throw new Error("One or more opportunities contain invalid data. Nothing was exported.");
    if (ids.has(item.id)) throw new Error("Duplicate opportunity IDs were found. Nothing was exported.");
    ids.add(item.id);
    return projectOpportunity(item);
  });
  const backup = {
    format: OPPORTUNITY_BACKUP_FORMAT,
    version: OPPORTUNITY_BACKUP_VERSION,
    exportedAt,
    opportunityCount: projected.length,
    evidenceCount: projected.reduce((sum, item) => sum + item.evidenceItems.length, 0),
    opportunities: projected,
  };
  if (new TextEncoder().encode(JSON.stringify(backup, null, 2)).byteLength > MAX_OPPORTUNITY_BACKUP_BYTES) {
    throw new Error("This backup would exceed 2 MB. Export smaller groups of opportunities or reduce large evidence notes.");
  }
  return backup;
}

export function parseOpportunityBackup(raw) {
  if (typeof raw !== "string") throw new Error("Choose a valid Zavqera JSON backup.");
  if (new TextEncoder().encode(raw).byteLength > MAX_OPPORTUNITY_BACKUP_BYTES) {
    throw new Error("This backup is larger than 2 MB. Nothing was imported.");
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("This file is not valid JSON. Nothing was imported.");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)
    || parsed.format !== OPPORTUNITY_BACKUP_FORMAT
    || parsed.version !== OPPORTUNITY_BACKUP_VERSION) {
    throw new Error("This is not a supported Zavqera Opportunity Intelligence backup.");
  }
  if (typeof parsed.exportedAt !== "string" || !Number.isFinite(Date.parse(parsed.exportedAt))) {
    throw new Error("The backup timestamp is invalid.");
  }
  if (!Array.isArray(parsed.opportunities)) throw new Error("The backup does not contain an opportunities list.");
  if (parsed.opportunities.length > MAX_IMPORTED_OPPORTUNITIES) {
    throw new Error(`This backup exceeds the limit of ${MAX_IMPORTED_OPPORTUNITIES} opportunities.`);
  }

  const ids = new Set();
  const opportunities = parsed.opportunities.map((item) => {
    if (!portableOpportunity(item)) {
      throw new Error("The backup contains invalid opportunity or evidence data. Nothing was imported.");
    }
    if (ids.has(item.id)) throw new Error("The backup contains duplicate opportunity IDs. Nothing was imported.");
    ids.add(item.id);
    return projectOpportunity(item);
  });
  const evidenceCount = opportunities.reduce((sum, item) => sum + item.evidenceItems.length, 0);
  if (parsed.opportunityCount !== opportunities.length || parsed.evidenceCount !== evidenceCount) {
    throw new Error("The backup counts do not match its contents. Nothing was imported.");
  }
  return {
    format: OPPORTUNITY_BACKUP_FORMAT,
    version: OPPORTUNITY_BACKUP_VERSION,
    exportedAt: parsed.exportedAt,
    opportunityCount: opportunities.length,
    evidenceCount,
    opportunities,
  };
}

/**
 * Merge an already-validated backup without ever replacing a local record.
 * Backups are validated by parseOpportunityBackup before reaching this helper.
 */
export function mergeOpportunityBackup(currentOpportunities, backup) {
  if (!Array.isArray(currentOpportunities)
    || backup?.format !== OPPORTUNITY_BACKUP_FORMAT
    || backup?.version !== OPPORTUNITY_BACKUP_VERSION
    || !Array.isArray(backup?.opportunities)) {
    throw new Error("Choose a validated Zavqera Opportunity Intelligence backup.");
  }

  const existingIds = new Set(currentOpportunities
    .map((item) => item?.id)
    .filter((id) => typeof id === "string"));
  const additions = backup.opportunities.filter((item) => !existingIds.has(item.id));

  return {
    opportunities: [...additions, ...currentOpportunities],
    addedCount: additions.length,
    skippedCount: backup.opportunities.length - additions.length,
    evidenceCount: additions.reduce((sum, item) => sum + item.evidenceItems.length, 0),
  };
}
