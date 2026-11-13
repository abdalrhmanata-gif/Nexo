import type { PortableOpportunity } from "./opportunity-portability.mjs";
import type { EvidenceSourceType, EvidenceStance, OpportunityEvidenceItem } from "./evidence-ledger.mjs";

export type OpportunityRow = {
  id: string;
  title: string;
  target: string;
  thesis: string;
  evidence_url: string;
  strategic_fit: number;
  potential_value: number;
  urgency: number;
  evidence_strength: number;
  effort: number;
  created_at_ms: number;
};

export type OpportunityEvidenceRow = {
  opportunity_id: string;
  id: string;
  url: string;
  title: string;
  observation: string;
  stance: EvidenceStance;
  source_type: EvidenceSourceType;
  source_date: string;
  reliability: number;
  checked_at: string;
  added_at_ms: number;
};

export type StoredOpportunityRow = OpportunityRow & {
  opportunity_evidence_items?: OpportunityEvidenceRow[] | null;
};

export type BrowserUploadPlan = {
  opportunityRows: OpportunityRow[];
  evidenceRows: OpportunityEvidenceRow[];
  leftBehindCount: number;
};

export declare const BROWSER_OPPORTUNITY_KEY: "zavqera.opportunity-intelligence.v1";
export declare const BROWSER_UPLOAD_MARKER_KEY: "zavqera.opportunity-intelligence.v1.uploaded";
export declare function opportunityToRow(opportunity: PortableOpportunity): OpportunityRow;
export declare function evidenceToRow(opportunityId: string, item: OpportunityEvidenceItem): OpportunityEvidenceRow;
export declare function opportunitiesFromRows(rows: StoredOpportunityRow[] | null | undefined): PortableOpportunity[];
export declare function readBrowserOpportunities(raw: string | null | undefined): unknown[];
export declare function planBrowserUpload(browserOpportunities: unknown, accountOpportunities: Array<{ id: string; evidenceItems?: Array<{ id: string }> }>): BrowserUploadPlan;
