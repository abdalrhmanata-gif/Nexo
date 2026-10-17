export const RESEARCH_CLAIM_FAILURES = Object.freeze({
  DENIED: "AGENT_RESEARCH_JIT_CLAIM_DENIED",
  UNCONFIRMED: "AGENT_RESEARCH_JIT_CLAIM_UNCONFIRMED",
});

// Keep API/generation classification separate from the deliberately narrow
// database evidence contract for a claim that did not cross the provider boundary.
export function buildResearchClaimFailureCompletion(code, requestId) {
  if (code === RESEARCH_CLAIM_FAILURES.DENIED) {
    return {
      status: "FAILED",
      result: { reason: "RESEARCH_JIT_CLAIM_DENIED" },
      evidence: { outcome: "FAILED", verified: false, request_id: requestId },
      errorCode: "RESEARCH_JIT_CLAIM_DENIED",
    };
  }

  if (code === RESEARCH_CLAIM_FAILURES.UNCONFIRMED) {
    return {
      status: "UNKNOWN",
      result: { reason: RESEARCH_CLAIM_FAILURES.UNCONFIRMED },
      evidence: { outcome: "UNKNOWN", verified: false, request_id: requestId },
      errorCode: RESEARCH_CLAIM_FAILURES.UNCONFIRMED,
    };
  }

  return null;
}
