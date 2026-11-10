import { createHash } from "node:crypto";

// What the database needs to know about a generation before it reserves one.
//
// reserve_ai_generation takes three arguments: the request id, the kind of
// generation, and a SHA-256 of what is being asked. With the hash it can tell
// an honest retry of the same request from a request id reused for something
// else, and refuse the second.
//
// The application called it with the request id alone. The one-argument
// function was dropped by the migration that added the other two, so on a
// database built from the migrations every generation stopped at "usage could
// not be verified" before a provider was ever contacted. Nothing failed
// loudly, because no generation had been attempted on production yet.

/** The kinds the database's check constraint accepts. */
export const GENERATION_KINDS = Object.freeze(["planner", "research"]);

/**
 * A stable fingerprint of one request: same kind, model and prompt, same
 * hash. Length-prefixed parts, so no two different requests can be joined
 * into the same string.
 */
export function requestHashFor({ kind, model, system, user }) {
  if (!GENERATION_KINDS.includes(kind)) throw new TypeError(`unknown generation kind: ${String(kind)}`);
  const hash = createHash("sha256");
  for (const part of [kind, model, system, user]) {
    if (typeof part !== "string") throw new TypeError("every part of a request identity is a string");
    hash.update(`${Buffer.byteLength(part, "utf8")}:`);
    hash.update(part, "utf8");
  }
  return hash.digest("hex");
}
