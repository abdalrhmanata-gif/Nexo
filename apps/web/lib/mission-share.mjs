// What a shared mission result may contain.
//
// A share is a copy of a mission's public face, stored on the server under an
// unguessable id. This module decides what goes into that copy: the name,
// the intent, the criteria, the finished steps and a few plain result
// values. Nothing that names a person, an account or a workspace, and
// nothing nested. Public result is not public workspace.

const FORBIDDEN_KEY_PARTS = ["email", "token", "secret", "password", "credential", "owner", "workspace", "user", "phone", "address", "authorization", "session", "customer"];
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

  const snapshot = {
    name: input.name.slice(0, 100),
    intent: input.intent.slice(0, 700),
    criteria: boundedStrings(input.criteria, 6, 180),
    completedSteps: boundedStrings(input.completedSteps, 6, 140),
    status: typeof input.status === "string" ? input.status.slice(0, 30) : "DRAFT",
    progress: Math.round(clamp(input.progress, 0, 100)),
  };
  if (outcome) snapshot.outcome = outcome;
  return snapshot;
}

/** The query that opens the new-mission form as a draft of this mission. */
export function remixQuery(snapshot) {
  return new URLSearchParams({
    name: snapshot.name,
    intent: snapshot.intent,
    criteria: snapshot.criteria.join("\n"),
    actions: snapshot.completedSteps.join("\n"),
  }).toString();
}

export function shareIdOrNull(value) {
  if (typeof value !== "string") return null;
  const id = value.trim().toLowerCase();
  return UUID.test(id) ? id : null;
}
