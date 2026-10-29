import type { OpportunityEvidenceItem } from "./evidence-ledger.mjs";

export type PortableOpportunity = {
  id: string;
  title: string;
  target: string;
  thesis: string;
  evidenceUrl: string;
  evidenceItems: OpportunityEvidenceItem[];
  strategicFit: number;
  potentialValue: number;
  urgency: number;
  evidenceStrength: number;
  effort: number;
  createdAt: number;
};

export type OpportunityBackup = {
  format: "zavqera-opportunity-intelligence";
  version: 1;
  exportedAt: string;
  opportunityCount: number;
  evidenceCount: number;
  opportunities: PortableOpportunity[];
};

export declare const OPPORTUNITY_BACKUP_FORMAT: "zavqera-opportunity-intelligence";
export declare const OPPORTUNITY_BACKUP_VERSION: 1;
export declare const MAX_OPPORTUNITY_BACKUP_BYTES: number;
export declare const MAX_IMPORTED_OPPORTUNITIES: number;
export declare const MAX_EVIDENCE_ITEMS_PER_OPPORTUNITY: number;
export declare function createOpportunityBackup(opportunities: PortableOpportunity[], exportedAt?: string): OpportunityBackup;
export declare function parseOpportunityBackup(raw: string): OpportunityBackup;
