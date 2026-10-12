import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import {
  dispatchThroughJitClaim,
  reconcileThroughTrustedClaim,
  PERSISTENT_DISPATCH_DECISIONS,
} from "../lib/mission-authority/persistent-dispatch-gateway.mjs";

const url = process.env.ZAVQERA_W72_SUPABASE_URL;
const serviceRoleKey = process.env.ZAVQERA_W72_SERVICE_ROLE_KEY;
const successExecutionId = process.env.ZAVQERA_W72_SUCCESS_EXECUTION_ID;
const unknownExecutionId = process.env.ZAVQERA_W72_UNKNOWN_EXECUTION_ID;
const expectedAudience = "w72-fake-provider.v1";

assert.ok(url && serviceRoleKey && successExecutionId && unknownExecutionId,
  "W72 requires ephemeral disposable Supabase fixture settings");
const parsedUrl = new URL(url);
assert.ok(
  ["127.0.0.1", "localhost", "[::1]"].includes(parsedUrl.hostname),
  "W72 may only run against the disposable loopback Supabase stack",
);
assert.notEqual(successExecutionId, unknownExecutionId);

const client = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

let successDispatchCalls = 0;
const successAdapter = {
  audience: expectedAudience,
  async dispatch(claim) {
    successDispatchCalls += 1;
    assert.equal(claim.executionId, successExecutionId);
    assert.equal(claim.audience, expectedAudience);
    assert.equal(claim.destination, "https://example.invalid/w72/success");
    assert.ok(claim.dispatchClaimedAt);
    assert.ok(claim.authorityHash);
    assert.ok(claim.requestHash);
    // Fake only: deliberately perform no network I/O.
    return {
      state: "SUCCEEDED",
      receipt: {
        provider: "w72-test-double",
        id: "w72-success-receipt",
        charge_amount: 2,
        currency: "USD",
      },
    };
  },
};

const success = await dispatchThroughJitClaim({
  client,
  adapter: successAdapter,
  executionId: successExecutionId,
});
assert.equal(
  success.decision,
  PERSISTENT_DISPATCH_DECISIONS.DISPATCHED,
  `W72 success path failed: ${JSON.stringify({
    decision: success.decision,
    reasonCode: success.reasonCode,
    status: success.status,
    persisted: success.persisted,
    dispatched: success.dispatched,
  })}`,
);
assert.equal(success.status, "SUCCEEDED");
assert.equal(success.persisted, true);
assert.equal(successDispatchCalls, 1);
assert.equal(success.receipt.id, "w72-success-receipt");
assert.equal(success.receipt.charge_amount, 2);

let uncertainDispatchCalls = 0;
let providerLookupCalls = 0;
const uncertainAdapter = {
  audience: expectedAudience,
  async dispatch(claim) {
    uncertainDispatchCalls += 1;
    assert.equal(claim.executionId, unknownExecutionId);
    assert.equal(claim.destination, "https://example.invalid/w72/unknown");
    // Emulates a provider timeout after a possible send; no actual call occurs.
    return { state: "UNKNOWN" };
  },
  async reconcile(claim) {
    providerLookupCalls += 1;
    assert.equal(claim.executionId, unknownExecutionId);
    assert.equal(claim.idempotencyKey.length >= 16, true);
    assert.ok(claim.reconciliationClaimToken);
    // Simulates an authoritative lookup confirming the request was never sent.
    return {
      state: "NOT_SENT",
      authoritative: true,
      method: "idempotency_key_lookup",
      providerState: "not_found",
      checkedAt: new Date().toISOString(),
    };
  },
};

const uncertain = await dispatchThroughJitClaim({
  client,
  adapter: uncertainAdapter,
  executionId: unknownExecutionId,
});
assert.equal(uncertain.decision, PERSISTENT_DISPATCH_DECISIONS.RECONCILE_REQUIRED);
assert.equal(uncertain.status, "UNKNOWN");
assert.equal(uncertain.persisted, true);
assert.equal(uncertainDispatchCalls, 1);

const reconciled = await reconcileThroughTrustedClaim({
  client,
  adapter: uncertainAdapter,
  executionId: unknownExecutionId,
});
assert.equal(reconciled.decision, PERSISTENT_DISPATCH_DECISIONS.RECONCILED);
assert.equal(reconciled.status, "FAILED");
assert.equal(reconciled.persisted, true);
assert.equal(reconciled.safeToRetry, true);
assert.equal(providerLookupCalls, 1);
assert.equal(uncertainDispatchCalls, 1, "reconciliation must never dispatch again");

console.log("W72_PERSISTENT_GATEWAY_POSTGRES_INTEGRATION=PASS");
console.log("success_path_persisted_with_receipt=PASS");
console.log("unknown_outcome_held_until_authoritative_no_send_lookup=PASS");
console.log("reconciliation_lookup_did_not_redispatch=PASS");
