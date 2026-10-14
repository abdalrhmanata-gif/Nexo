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

function collectSourceReasonCodes() {
  const codes = new Set();
  const migrationNames = readdirSync(migrationsRoot)
    .filter((name) => /^\d+_w(?:68|69|70|71|72|73|74|75|76|77|78|79|80)_.*\.sql$/i.test(name));

  assert.ok(migrationNames.length >= 11, "expected the W68-W80 candidate migration set to exist");
  for (const name of migrationNames) {
    const source = readFileSync(join(migrationsRoot, name), "utf8");
    for (const match of source.matchAll(/raise\s+exception\s+'([A-Z][A-Z0-9_]{2,90})'/gi)) {
      codes.add(match[1]);
    }
  }

  const gateway = readFileSync(gatewayPath, "utf8");
  const knownDenials = gateway.match(/const KNOWN_DENIAL_CODES = new Set\(\[([\s\S]*?)\]\);/);
  assert.ok(knownDenials, "gateway denial-code set must be present");
  for (const match of knownDenials[1].matchAll(/"([A-Z][A-Z0-9_]{2,90})"/g)) {
    codes.add(match[1]);
  }
  const statusAndDecisionValues = new Set([
    "SUCCEEDED", "UNKNOWN", "DENY", "ALLOW", "DISPATCHED", "RECONCILED",
    "RECONCILE_REQUIRED", "REQUIRE_APPROVAL", "RETRYABLE_NOT_SENT",
  ]);
  for (const line of gateway.split("\n")) {
    if (!/\b(?:reasonCode|blockReasonCode):/.test(line)) continue;
    for (const match of line.matchAll(/"([A-Z][A-Z0-9_]{2,90})"/g)) {
      if (!statusAndDecisionValues.has(match[1])) codes.add(match[1]);
    }
  }
  return [...codes].sort();
}

test("every W68-W80 SQL exception and explicit gateway reason has a canonical mapping", () => {
  const sourceCodes = collectSourceReasonCodes();
  assert.ok(sourceCodes.length >= 120, `expected broad source inventory, got ${sourceCodes.length}`);
  const missing = sourceCodes.filter((code) => !isKnownMissionAuthoritySourceReasonCode(code));
  assert.deepEqual(missing, [], "a new SQL/gateway reason must be mapped explicitly before code lands");
  for (const sourceCode of sourceCodes) {
    assert.ok(MISSION_AUTHORITY_REASON_CODES.includes(normalizeMissionAuthorityReasonCode(sourceCode)));
  }
});

test("known alias codes normalize without changing SQL strings or runtime paths", () => {
  assert.equal(
    normalizeMissionAuthorityReasonCode("AUTHORITY_BUDGET_NOT_IN_VALIDITY_WINDOW"),
    "AUTHORITY_BUDGET_OUTSIDE_VALIDITY_WINDOW",
  );
  assert.equal(
    normalizeMissionAuthorityReasonCode("EXECUTION_ALREADY_CLAIMED_FOR_DISPATCH"),
    "DISPATCH_ALREADY_CLAIMED",
  );
  assert.equal(
    normalizeMissionAuthorityReasonCode("PROVIDER_NOT_SENT_PROOF_REQUIRED"),
    "PROVIDER_NO_SEND_PROOF_REQUIRED",
  );
  assert.equal(
    normalizeMissionAuthorityReasonCode("APPROVAL_REQUIRED_OR_SCOPE_CHANGED"),
    "APPROVAL_REQUIRED_OR_SCOPE_CHANGED",
    "the ambiguous SQL code must remain ambiguous until a separately reviewed SQL change",
  );
});

test("unknown, malformed and raw error text fail closed without being reflected", () => {
  for (const input of [
    "provider-secret-token=abc",
    "42501: permission denied for user someone",
    "new_unreviewed_reason",
    "",
    null,
    undefined,
    42,
    {},
  ]) {
    assert.equal(normalizeMissionAuthorityReasonCode(input), "DECISION_DEPENDENCY_UNAVAILABLE");
  }
  assert.equal(isKnownMissionAuthoritySourceReasonCode("new_unreviewed_reason"), false);
});
