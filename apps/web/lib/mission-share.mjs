// What a shared mission result may contain.
//
// A share is a copy of a mission's public face, stored on the server under an
// unguessable id. This module decides what goes into that copy: the name,
// the intent, the criteria, the titles of the steps (finished and still to
// do) and a few plain result values. Step notes and evidence stay private. Nothing that names a person, an account or a workspace, and
// nothing nested. Public result is not public workspace.

const FORBIDDEN_KEY_PARTS = ["email", "token", "secret", "password", "credential", "owner", "workspace", "user", "phone", "address", "authorization", "session", "customer"];
/** Steps a shared copy keeps, done and still to do together. */
export const MAX_SHARED_STEPS = 20;
/** Under the database's 8000-byte limit on a stored copy, with room to spare. */
const MAX_SNAPSHOT_BYTES = 7600;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function isSafeResultKey(key) {
  if (typeof key !== "string" || key.length < 1 || key.length > 50) return false;
  if (!/^[A-Za-z0-9 _-]+$/.test(key)) return false;
  const lower = key.toLowerCase();
  return !FORBIDDEN_KEY_PARTS.some((part) => lower.includes(part));
}

function boundedStrings(input, limit, maxLength) {
  if (!Array.isArray(input)) return [];
  return input.filter((item) => typeof item === "string" && item.trim()).slice(0, limit).map((item) => item.slice(0, maxLength));
}

function clamp(value, low, high) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(low, Math.min(high, value)) : low;
}

/** The public copy of a mission, or null when there is no mission to copy. */
export function publicMissionSnapshot(input) {
  if (!input || typeof input !== "object" || typeof input.name !== "string" || typeof input.intent !== "string") return null;
  if (!input.name.trim() || !input.intent.trim()) return null;

  let outcome;
  const candidate = input.outcome;
  if (candidate && typeof candidate === "object" && (candidate.status === "COMPLETED" || candidate.status === "FAILED")) {
    const source = candidate.result && typeof candidate.result === "object" && !Array.isArray(candidate.result) ? candidate.result : {};
    const result = Object.fromEntries(
      Object.entries(source)
        .filter(([key, value]) => isSafeResultKey(key) && ["string", "number", "boolean"].includes(typeof value))
        .slice(0, 4)
        .map(([key, value]) => [key, typeof value === "string" ? value.slice(0, 240) : value]),
    );
    outcome = { status: candidate.status, successScore: clamp(candidate.successScore, 0, 1), result };
  }

  // A shared checklist is copied by whoever opens it, so it keeps every step
  // a real checklist has (up to MAX_SHARED_STEPS), done ones first.
  const completedSteps = boundedStrings(input.completedSteps, MAX_SHARED_STEPS, 140);
  const plannedSteps = boundedStrings(input.plannedSteps, MAX_SHARED_STEPS - completedSteps.length, 140);
  const snapshot = {
    name: input.name.slice(0, 100),
    intent: input.intent.slice(0, 700),
    criteria: boundedStrings(input.criteria, 6, 180),
    completedSteps,
    plannedSteps,
    status: typeof input.status === "string" ? input.status.slice(0, 30) : "DRAFT",
    progress: Math.round(clamp(input.progress, 0, 100)),
  };
  if (outcome) snapshot.outcome = outcome;
  // The database refuses a copy over 8000 bytes; Arabic takes two bytes a
  // letter. Drop steps from the end until it fits, the planned ones first.
  const encoder = new TextEncoder();
  while (encoder.encode(JSON.stringify(snapshot)).length > MAX_SNAPSHOT_BYTES && (snapshot.plannedSteps.length || snapshot.completedSteps.length)) {
    if (snapshot.plannedSteps.length) snapshot.plannedSteps.pop();
    else snapshot.completedSteps.pop();
  }
  return snapshot;
}

/** The query that opens the new-mission form as a draft of this mission. */
export function remixQuery(snapshot) {
  return new URLSearchParams({
    name: snapshot.name,
    intent: snapshot.intent,
    criteria: snapshot.criteria.join("\n"),
    // Links shared before planned steps were stored have none.
    actions: [...snapshot.completedSteps, ...(snapshot.plannedSteps ?? [])].join("\n"),
  }).toString();
}

export function shareIdOrNull(value) {
  if (typeof value !== "string") return null;
  const id = value.trim().toLowerCase();
  return UUID.test(id) ? id : null;
}

/** What is handed to the share sheet or the clipboard: the name, then the link. */
export function shareMessage(name, url) {
  const title = typeof name === "string" ? name.trim() : "";
  return title ? `${title}\n${url}` : url;
}

/**
 * Where a shared Mission can be sent from the share panel. Each address is
 * the service's own public share link; nothing is sent until the person
 * confirms there.
 */
export function shareTargets(name, url) {
  const title = typeof name === "string" ? name.trim() : "";
  const message = shareMessage(title, url);
  const q = (fields) => Object.entries(fields).map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join("&");
  return [
    // Web mail first: a mailto link asks the computer which app to use, and
    // many have none set up.
    { id: "gmail", label: "Gmail", href: `https://mail.google.com/mail/?${q({ view: "cm", fs: "1", su: title || "Zavqera", body: message })}` },
    { id: "outlook", label: "Outlook", href: `https://outlook.live.com/mail/0/deeplink/compose?${q({ subject: title || "Zavqera", body: message })}` },
    { id: "whatsapp", label: "WhatsApp", href: `https://wa.me/?${q({ text: message })}` },
    { id: "x", label: "X", href: `https://x.com/intent/post?${q({ text: title, url })}` },
    { id: "linkedin", label: "LinkedIn", href: `https://www.linkedin.com/sharing/share-offsite/?${q({ url })}` },
    { id: "facebook", label: "Facebook", href: `https://www.facebook.com/sharer/sharer.php?${q({ u: url })}` },
    { id: "email", label: "Email app", href: `mailto:?${q({ subject: title || "Zavqera", body: message })}` },
  ];
}
