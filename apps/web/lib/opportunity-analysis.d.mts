import type { OpportunityEvidenceItem } from "./evidence-ledger.mjs";
import type { OpportunityScoreInput } from "./opportunity-intelligence.mjs";

export type OpportunityAnalysisInput = {
  title: string;
  target: string;
  thesis: string;
  evidenceUrl: string;
  ratings: OpportunityScoreInput;
  score: number;
  priority: "HIGH_SCORE" | "VALIDATE" | "HOLD";
  evidenceItems: OpportunityEvidenceItem[];
  totalEvidenceCount: number;
  omittedEvidenceCount: number;
};

export type OpportunityAnalysisDecision = "TEST" | "PURSUE" | "PIVOT" | "DEFER" | "STOP" | "INSUFFICIENT_EVIDENCE";
export type OpportunityAnalysisClaimKind = "evidence" | "inference" | "unknown";
export type OpportunityAnalysisConfidence = "low" | "medium" | "high";

export type OpportunityAnalysisReport = {
  decision: OpportunityAnalysisDecision;
  executiveSummary: string;
  decisionRationale: string;
  claims: Array<{
    claim: string;
    kind: OpportunityAnalysisClaimKind;
    confidence: OpportunityAnalysisConfidence;
    evidenceIds: string[];
  }>;
  risks: Array<{ risk: string; severity: "low" | "medium" | "high"; mitigation: string }>;
  criticalUnknowns: string[];
  recommendedExperiment: {
    hypothesis: string;
    steps: string[];
    successMetric: string;
    successThreshold: string;
    failureThreshold: string;
    estimatedEffort: string;
    costAssumptions: string;
  };
  missionDraft: { name: string; intent: string; successCriteria: string[]; firstActions: string[] };
};

export declare const MAX_ANALYSIS_EVIDENCE_ITEMS: number;
export declare const MAX_ANALYSIS_REQUEST_CHARS: number;
export declare const MAX_ANALYSIS_REPORT_CHARS: number;
export declare function normalizeOpportunityAnalysisRequest(value: unknown): OpportunityAnalysisInput;
export declare function buildOpportunityAnalysisPrompt(input: OpportunityAnalysisInput): { system: string; user: string };
export declare function validateOpportunityAnalysisReport(value: unknown, evidenceItems?: OpportunityEvidenceItem[]): OpportunityAnalysisReport;
