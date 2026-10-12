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
