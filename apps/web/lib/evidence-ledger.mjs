export const EVIDENCE_STANCES = Object.freeze(["supports", "challenges", "context"]);
export const EVIDENCE_SOURCE_TYPES = Object.freeze(["official", "news", "research", "customer", "competitor", "other"]);

export function isHttpSourceUrl(value) {
  try {
    const url = new URL(String(value));
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/** Canonical comparison key for duplicate detection; does not replace the original cited URL. */
export function normaliseEvidenceUrl(value) {
  if (!isHttpSourceUrl(value)) return null;
  const url = new URL(String(value).trim());
  url.hash = "";
  url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  if ((url.protocol === "https:" && url.port === "443") || (url.protocol === "http:" && url.port === "80")) {
    url.port = "";
  }
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_.+|fbclid|gclid|mc_cid|mc_eid)$/i.test(key)) url.searchParams.delete(key);
  }
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "");
  url.searchParams.sort();
  return url.href;
}

export function findDuplicateEvidence(items, candidateUrl, legacySourceUrl = "") {
  const candidate = normaliseEvidenceUrl(candidateUrl);
  if (!candidate) return false;
  if (legacySourceUrl && normaliseEvidenceUrl(legacySourceUrl) === candidate) return true;
  return (Array.isArray(items) ? items : []).some((item) => normaliseEvidenceUrl(item?.url) === candidate);
}

export function summariseEvidence(items) {
  const evidence = Array.isArray(items) ? items : [];
  const summary = {
    total: evidence.length,
    supports: evidence.filter((item) => item?.stance === "supports").length,
    challenges: evidence.filter((item) => item?.stance === "challenges").length,
    context: evidence.filter((item) => item?.stance === "context").length,
    highReliability: evidence.filter((item) => Number(item?.reliability) >= 4).length,
  };
  summary.signal = summary.total === 0
    ? "NO_RECORDED_EVIDENCE"
    : summary.supports > 0 && summary.challenges > 0
      ? "MIXED_SIGNALS"
      : summary.challenges > 0
        ? "COUNTER_SIGNALS_RECORDED"
        : summary.supports > 0
          ? "SUPPORT_SIGNALS_RECORDED"
          : "CONTEXT_ONLY";
  return summary;
}

export function buildPublicSearchUrls(input) {
  const parts = [input?.title, input?.target, input?.thesis]
    .map((part) => String(part ?? "").trim())
    .filter(Boolean);
  const query = parts.join(" ").slice(0, 360).trim();
  const params = new URLSearchParams({ q: query });
  const newsParams = new URLSearchParams({ q: query });
  newsParams.set("tbm", "nws");
  return {
    query,
    webUrl: query ? `https://www.google.com/search?${params.toString()}` : "https://www.google.com/",
    newsUrl: query ? `https://www.google.com/search?${newsParams.toString()}` : "https://news.google.com/",
  };
}

export function isOpportunityEvidenceItem(value) {
  if (!value || typeof value !== "object") return false;
  const item = value;
  return typeof item.id === "string"
    && typeof item.url === "string" && isHttpSourceUrl(item.url)
    && typeof item.title === "string" && item.title.trim().length > 0
    && typeof item.observation === "string" && item.observation.trim().length > 0
    && EVIDENCE_STANCES.includes(item.stance)
    && EVIDENCE_SOURCE_TYPES.includes(item.sourceType)
    && typeof item.sourceDate === "string"
    && Number.isInteger(item.reliability) && item.reliability >= 1 && item.reliability <= 5
    && typeof item.checkedAt === "string"
    && Number.isFinite(item.addedAt);
}


export const MISSION_EVIDENCE_STANCES = Object.freeze(["supports", "challenges", "context"]);
export const MISSION_EVIDENCE_SOURCE_TYPES = Object.freeze([
  "official", "publication", "internal_document", "measurement", "customer", "conversation", "other",
]);

function isCalendarDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(\`\${value}T00:00:00.000Z\`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/**
 * Validates the evidence JSON accepted by the existing authenticated
 * create_mission_verification RPC. This records user-reviewed material; it
 * does not claim that Zavqera independently verified any source.
 */
export function validateMissionEvidencePayload(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { valid: false, error: "Evidence must be an object." };
  }
  const summary = typeof input.summary === "string" ? input.summary.trim() : "";
  if (summary.length < 12 || summary.length > 2000) {
    return { valid: false, error: "Add an evidence summary between 12 and 2,000 characters." };
  }
  if (!Array.isArray(input.items) || input.items.length < 1 || input.items.length > 8) {
    return { valid: false, error: "Record between 1 and 8 evidence items." };
  }

  const seenUrls = new Set();
  const items = [];
  for (const raw of input.items) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return { valid: false, error: "Every evidence item must be an object." };
    }
    const id = typeof raw.id === "string" ? raw.id.trim() : "";
    const title = typeof raw.title === "string" ? raw.title.trim() : "";
    const observation = typeof raw.observation === "string" ? raw.observation.trim() : "";
    const referenceUrl = typeof raw.referenceUrl === "string" ? raw.referenceUrl.trim() : "";
    const sourceType = raw.sourceType;
    const stance = raw.stance;
    const publishedAt = typeof raw.publishedAt === "string" ? raw.publishedAt.trim() : "";

    if (!/^[A-Za-z0-9_-]{8,80}$/.test(id)) {
      return { valid: false, error: "An evidence item has an invalid identifier." };
    }
    if (!title || title.length > 180) {
      return { valid: false, error: "Each evidence item needs a title of up to 180 characters." };
    }
    if (!observation || observation.length > 1200) {
      return { valid: false, error: "Each evidence item needs an observation of up to 1,200 characters." };
    }
    if (!MISSION_EVIDENCE_STANCES.includes(stance)) {
      return { valid: false, error: "Choose whether the evidence supports, challenges or contextualises the outcome." };
    }
    if (!MISSION_EVIDENCE_SOURCE_TYPES.includes(sourceType)) {
      return { valid: false, error: "Choose a valid evidence source type." };
    }
    if (referenceUrl && (referenceUrl.length > 500 || !isHttpSourceUrl(referenceUrl))) {
      return { valid: false, error: "Evidence references must use a public HTTP or HTTPS URL." };
    }
    if (referenceUrl) {
      const canonical = normaliseEvidenceUrl(referenceUrl);
      if (seenUrls.has(canonical)) {
        return { valid: false, error: "The same source URL cannot be recorded twice." };
      }
      seenUrls.add(canonical);
    }
    if (publishedAt && !isCalendarDate(publishedAt)) {
      return { valid: false, error: "Enter a valid publication or observation date." };
    }
    items.push({ id, title: title.slice(0, 180), observation: observation.slice(0, 1200), referenceUrl, sourceType, stance, publishedAt });
  }

  return {
    valid: true,
    value: {
      summary: summary.slice(0, 2000),
      items,
      recordType: "USER_REVIEWED_EVIDENCE",
      independentVerification: false,
    },
  };
}

/**
 * Validates the human's final outcome choice in the existing mission_outcomes
 * result JSON. It does not grant delegated authority or approve external work.
 */
export function validateMissionOutcomeDecision(input, requestedStatus) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { valid: false, error: "The outcome decision must be an object." };
  }
  const summary = typeof input.summary === "string" ? input.summary.trim() : "";
  const rationale = typeof input.rationale === "string" ? input.rationale.trim() : "";
  const decision = input.decision;
  if (!summary || summary.length > 2000) {
    return { valid: false, error: "Add an outcome summary of up to 2,000 characters." };
  }
  if (rationale.length < 12 || rationale.length > 1200) {
    return { valid: false, error: "Explain the decision in 12 to 1,200 characters." };
  }
  if (decision !== "PROCEED" && decision !== "STOP") {
    return { valid: false, error: "Choose Proceed or Stop for this outcome." };
  }
  const status = decision === "PROCEED" ? "COMPLETED" : "FAILED";
  if (requestedStatus !== undefined && requestedStatus !== status) {
    return { valid: false, error: "The outcome status must match the recorded decision." };
  }
  return {
    valid: true,
    status,
    value: {
      summary: summary.slice(0, 2000),
      decision,
      rationale: rationale.slice(0, 1200),
      decisionType: "HUMAN_OUTCOME_DECISION",
    },
  };
}
