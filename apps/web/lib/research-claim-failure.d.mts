export const RESEARCH_CLAIM_FAILURES: Readonly<{
  DENIED: "AGENT_RESEARCH_JIT_CLAIM_DENIED";
  UNCONFIRMED: "AGENT_RESEARCH_JIT_CLAIM_UNCONFIRMED";
}>;

export type ResearchClaimFailureCompletion = {
  status: "FAILED" | "UNKNOWN";
  result: { reason: string };
  evidence: { outcome: "FAILED" | "UNKNOWN"; verified: false; request_id: string };
  errorCode: string;
};

export function buildResearchClaimFailureCompletion(
  code: string,
  requestId: string,
): ResearchClaimFailureCompletion | null;
