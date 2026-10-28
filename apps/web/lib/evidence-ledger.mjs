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
