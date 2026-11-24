// Proof recorded on a single step: an optional short note and an optional
// link. Both are free to leave empty; a step can be done without proof.
// The limits match the database constraints on mission_actions.

export const PROOF_NOTE_MAX = 1000;
export const PROOF_URL_MAX = 2048;

const BARE_DOMAIN = /^(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d+)?(?:[/?#]|$)/i;

/**
 * Cleans what the user typed. Returns { ok: true, note, url } with empty
 * values as null, or { ok: false, error } with a sentence for the user.
 * "example.com/receipt" is accepted and stored as https://example.com/receipt.
 */
export function normaliseProof(input = {}) {
  const rawNote = typeof input.note === "string" ? input.note : input.note == null ? "" : null;
  const rawUrl = typeof input.url === "string" ? input.url : input.url == null ? "" : null;
  if (rawNote === null || rawUrl === null) return { ok: false, error: "Proof must be text." };

  const note = rawNote.trim();
  if (note.length > PROOF_NOTE_MAX) return { ok: false, error: "Keep the proof note under 1,000 characters." };

  let url = rawUrl.trim();
  if (url) {
    if (/\s/.test(url)) return { ok: false, error: "The proof link cannot contain spaces." };
    if (!/^[a-z][a-z0-9+.-]*:/i.test(url)) {
      if (!BARE_DOMAIN.test(url)) return { ok: false, error: "Enter a full web link, for example https://example.com/receipt." };
      url = `https://${url}`;
    }
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      return { ok: false, error: "Enter a full web link, for example https://example.com/receipt." };
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return { ok: false, error: "The proof link must start with https:// or http://." };
    }
    if (!parsed.hostname) return { ok: false, error: "Enter a full web link, for example https://example.com/receipt." };
    if (url.length > PROOF_URL_MAX) return { ok: false, error: "The proof link is too long." };
  }

  return { ok: true, note: note || null, url: url || null };
}

export function hasProof(action) {
  return Boolean(action && (action.evidenceNote || action.evidenceUrl));
}

/** The short host shown instead of a long link, e.g. "stripe.com". */
export function proofLinkLabel(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * One line for the verification evidence: the step and, when recorded, how
 * the user knows it was done.
 */
export function proofCitation(action) {
  const parts = [action.evidenceNote, action.evidenceUrl].filter(Boolean);
  // "Check the rules.: read the page" read badly; drop the title's own stop.
  const title = String(action.title).trim().replace(/[.。!؟?]+$/u, "");
  return parts.length ? `- ${title}: ${parts.join(" ")}` : `- ${action.title}`;
}

/**
 * The evidence summary pre-filled for verification: every completed step
 * that carries proof. Steps without proof are offered as buttons instead, so
 * the summary never claims more than the user recorded.
 */
export function evidenceFromProof(actions = []) {
  return actions
    .filter((action) => action.status === "COMPLETED" && hasProof(action))
    .map(proofCitation)
    .join("\n");
}
