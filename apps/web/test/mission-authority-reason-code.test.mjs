import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  isKnownMissionAuthoritySourceReasonCode,
  MISSION_AUTHORITY_REASON_CODES,
  normalizeMissionAuthorityReasonCode,
} from "../lib/mission-authority/reason-code.mjs";

const webRoot = join(import.meta.dirname, "..");
const migrationsRoot = join(webRoot, "..", "..", "supabase", "migrations");
const gatewayPath = join(webRoot, "lib", "mission-authority", "persistent-dispatch-gateway.mjs");
const controlledAdapterPath = join(webRoot, "lib", "mission-authority", "controlled-adapter.mjs");

const nonReasonValues = new Set([
  "SUCCEEDED", "FAILED", "ACCEPTED", "NOT_STARTED", "NOT_SENT", "UNKNOWN",
  "AUTHORIZED", "RECONCILED_NOT_SENT", "ALLOW", "DENY", "DISPATCHED",
  "RECONCILED", "RECONCILE_REQUIRED", "REQUIRE_APPROVAL", "RETRYABLE_NOT_SENT",
  "FAKE_ACCEPTED", "FOUND", "INCONCLUSIVE", "PROVEN_NOT_SENT",
  "UNKNOWN_AFTER_SEND", "UNKNOWN_BEFORE_SEND", "UNKNOWN_INCONCLUSIVE",
]);

function collectSourceReasonCodes() {
  const codes = new Set();
  const migrationNames = readdirSync(migrationsRoot)
    .filter((name) => /^\d+_w(?:68|69|70|71|72|73|74|75|76|77|78|79|80)_.*\.sql$/i.test(name));
  assert.ok(migrationNames.length >= 11, "expected the W68-W80 candidate migration set to exist");

  for (const name of migrationNames) {
    const source = readFileSync(join(migrationsRoot, name), "utf8");
    for (const match of source.matchAll(/raise\s+exception\s+'([A-Z][A-Z0-9_]{2,90})'/gi)) codes.add(match[1]);
  }

  const gateway = readFileSync(gatewayPath, "utf8");
  const knownDenials = gateway.match(/const KNOWN_DENIAL_CODES = new Set\(\[([\s\S]*?)\]\);/);
  assert.ok(knownDenials, "gateway denial-code set must be present");
  for (const match of knownDenials[1].matchAll(/"([A-Z][A-Z0-9_]{2,90})"/g)) codes.add(match[1]);
  for (const line of gateway.split("\n")) {
    if (!/\b(?:reasonCode|blockReasonCode):/.test(line)) continue;
    for (const match of line.matchAll(/"([A-Z][A-Z0-9_]{2,90})"/g)) {
      if (!nonReasonValues.has(match[1])) codes.add(match[1]);
    }
  }

  const adapter = readFileSync(controlledAdapterPath, "utf8");
  for (const pattern of [
    /this\.#deny\("([A-Z][A-Z0-9_]{2,90})"\)/g,
    /reasonCode:\s*"([A-Z][A-Z0-9_]{2,90})"/g,
    /this\.code\s*=\s*"([A-Z][A-Z0-9_]{2,90})"/g,
    /new AuthorityViolation\("([A-Z][A-Z0-9_]{2,90})"\)/g,
  ]) for (const match of adapter.matchAll(pattern)) {
    if (!nonReasonValues.has(match[1])) codes.add(match[1]);
  }
  for (const match of adapter.matchAll(/\["(?:notBefore|expiresAt|leaseExpiresAt)",\s*"([A-Z][A-Z0-9_]{2,90})"\]/g)) codes.add(match[1]);
  assert.match(adapter, /MISSING_\$\{name\.toUpperCase\(\)\}/,
    "dynamic required-field codes must be handled as one reviewed family");
  return [...codes].sort();
}

test("W68-W80 SQL, persistent gateway and controlled-adapter reasons all map", () => {
  const sourceCodes = collectSourceReasonCodes();
  assert.ok(sourceCodes.length >= 145, `expected broad source inventory including controlled-adapter, got ${sourceCodes.length}`);
  const missing = sourceCodes.filter((code) => !isKnownMissionAuthoritySourceReasonCode(code));
  assert.deepEqual(missing, [], "a new SQL/gateway/adapter reason must be mapped before code lands");
  for (const sourceCode of sourceCodes) {
    assert.ok(MISSION_AUTHORITY_REASON_CODES.includes(normalizeMissionAuthorityReasonCode(sourceCode)));
  }
});

test("aliases normalize consistently while ambiguous approval SQL remains explicit", () => {
  assert.equal(normalizeMissionAuthorityReasonCode("AUTHORITY_BUDGET_NOT_IN_VALIDITY_WINDOW"), "AUTHORITY_BUDGET_OUTSIDE_VALIDITY_WINDOW");
  assert.equal(normalizeMissionAuthorityReasonCode("EXECUTION_ALREADY_CLAIMED_FOR_DISPATCH"), "DISPATCH_ALREADY_CLAIMED");
  assert.equal(normalizeMissionAuthorityReasonCode("PROVIDER_NOT_SENT_PROOF_REQUIRED"), "PROVIDER_NO_SEND_PROOF_REQUIRED");
  assert.equal(normalizeMissionAuthorityReasonCode("AUTHORITY_REVOKED"), "AUTHORITY_REVOKED");
  assert.equal(normalizeMissionAuthorityReasonCode("INPUT_HASH_MISMATCH"), "AUTHORITY_BINDING_MISMATCH");
  assert.equal(normalizeMissionAuthorityReasonCode("UNKNOWN_REQUIRES_RECONCILIATION"), "PROVIDER_OUTCOME_UNKNOWN");
  assert.equal(normalizeMissionAuthorityReasonCode("MISSING_ACTION_ID"), "REQUEST_INVALID");
  assert.equal(normalizeMissionAuthorityReasonCode("APPROVAL_REQUIRED_OR_SCOPE_CHANGED"), "APPROVAL_REQUIRED_OR_SCOPE_CHANGED");
  assert.equal(normalizeMissionAuthorityReasonCode("ALLOW"), "DECISION_DEPENDENCY_UNAVAILABLE",
    "ALLOW is a decision, not a reason code");
});

test("unknown, malformed and raw error text fail closed without being reflected", () => {
  for (const input of ["provider-secret-token=abc", "42501: permission denied for user someone", "new_unreviewed_reason", "", null, undefined, 42, {}]) {
    assert.equal(normalizeMissionAuthorityReasonCode(input), "DECISION_DEPENDENCY_UNAVAILABLE");
  }
  assert.equal(isKnownMissionAuthoritySourceReasonCode("new_unreviewed_reason"), false);
});
