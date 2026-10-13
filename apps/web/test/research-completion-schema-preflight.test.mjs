import assert from "node:assert/strict";
import test from "node:test";
import {
  isResearchCompletionSchemaProbeError,
  RESEARCH_COMPLETION_SCHEMA_PROBE_UUID,
} from "../lib/mission-authority/research-completion-schema-preflight.mjs";

test("recognizes only the expected invalid-UUID coercion from the RPC schema probe", () => {
  assert.equal(isResearchCompletionSchemaProbeError({
    code: "22P02",
    message: `invalid input syntax for type uuid: "${RESEARCH_COMPLETION_SCHEMA_PROBE_UUID}"`,
  }), true);
});

test("does not mistake a missing RPC, permission failure or another cast error for schema readiness", () => {
  assert.equal(isResearchCompletionSchemaProbeError({
    code: "PGRST202",
    message: "Could not find the function public.complete_read_only_research_execution",
  }), false);
  assert.equal(isResearchCompletionSchemaProbeError({
    code: "42501",
    message: "permission denied for function complete_read_only_research_execution",
  }), false);
  assert.equal(isResearchCompletionSchemaProbeError({
    code: "22P02",
    message: 'invalid input syntax for type uuid: "another-value"',
  }), false);
  assert.equal(isResearchCompletionSchemaProbeError(null), false);
  assert.equal(isResearchCompletionSchemaProbeError("22P02"), false);
});

import { readFileSync } from "node:fs";

const trustedWorkerRoute = readFileSync(
  new URL("../app/api/internal/agent-executions/[executionId]/route.ts", import.meta.url),
  "utf8",
);

test("internal worker schema probe is token-protected, read-only, and fail-closed", () => {
  const authGate = trustedWorkerRoute.indexOf("if (!isTrustedExecutionWorkerRequest(");
  const preflightStart = trustedWorkerRoute.indexOf('if (workerBody.operation === "preflight_read_only_research")');
  const completionStart = trustedWorkerRoute.indexOf('if (workerBody.operation === "complete_read_only_research")');
  const dispatchBoundary = trustedWorkerRoute.indexOf("runMissionActionWorker({");

  assert.ok(authGate >= 0 && authGate < preflightStart,
    "worker bearer authorization must be enforced before the probe operation");
  assert.ok(preflightStart >= 0 && completionStart > preflightStart,
    "preflight must be handled in its own operation branch");
  assert.ok(dispatchBoundary > completionStart,
    "the schema probe branch must terminate before the dispatch/reconciliation runtime boundary");

  const preflightBranch = trustedWorkerRoute.slice(preflightStart, completionStart);
  assert.match(preflightBranch, /new Set\(\["operation", "requestedBy"\]\)/,
    "the probe accepts only the operation and a validated requester id");
  assert.match(preflightBranch, /RESEARCH_COMPLETION_SCHEMA_PROBE_UUID/,
    "the probe must use the deliberately malformed, non-row-targeting UUID");
  assert.match(preflightBranch, /client\.rpc\("complete_read_only_research_execution"/,
    "the probe resolves the exact trusted-completion RPC by its expected name");
  assert.match(preflightBranch, /p_requested_by: workerBody\.requestedBy/);
  assert.match(preflightBranch, /isResearchCompletionSchemaProbeError\(probe\.error\)/,
    "only the expected UUID-cast error is evidence that the signature resolved");
  assert.match(preflightBranch, /\{ status: 503, headers: NO_STORE \}/,
    "unexpected errors fail closed");
  assert.doesNotMatch(preflightBranch, /\.(?:insert|update|upsert|delete)\s*\(/,
    "the schema preflight must not directly mutate tables");
  assert.doesNotMatch(preflightBranch, /dispatchThroughJitClaim|reconcileThroughTrustedClaim/,
    "the schema preflight must not dispatch or reconcile external execution");
});
