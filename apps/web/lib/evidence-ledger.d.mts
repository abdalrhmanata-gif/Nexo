export type EvidenceStance = "supports" | "challenges" | "context";
export type EvidenceSourceType = "official" | "news" | "research" | "customer" | "competitor" | "other";
export type OpportunityEvidenceItem = {
  id: string;
  url: string;
  title: string;
  observation: string;
  stance: EvidenceStance;
  sourceType: EvidenceSourceType;
  sourceDate: string;
  reliability: number;
  checkedAt: string;
  addedAt: number;
};
export declare const EVIDENCE_STANCES: readonly EvidenceStance[];
export declare const EVIDENCE_SOURCE_TYPES: readonly EvidenceSourceType[];
export declare function isHttpSourceUrl(value: string): boolean;
export declare function normaliseEvidenceUrl(value: string): string | null;
export declare function findDuplicateEvidence(items: OpportunityEvidenceItem[], candidateUrl: string, legacySourceUrl?: string): boolean;
export declare function summariseEvidence(items: OpportunityEvidenceItem[]): {
  total: number; supports: number; challenges: number; context: number; highReliability: number;
  signal: "NO_RECORDED_EVIDENCE" | "MIXED_SIGNALS" | "COUNTER_SIGNALS_RECORDED" | "SUPPORT_SIGNALS_RECORDED" | "CONTEXT_ONLY";
};
export declare function buildPublicSearchUrls(input: { title?: string; target?: string; thesis?: string }): {
  query: string; webUrl: string; newsUrl: string;
};
export declare function isOpportunityEvidenceItem(value: unknown): value is OpportunityEvidenceItem;
