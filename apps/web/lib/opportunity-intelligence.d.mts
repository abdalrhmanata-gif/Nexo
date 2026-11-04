export type OpportunityScoreInput = {
  strategicFit: number;
  potentialValue: number;
  urgency: number;
  evidenceStrength: number;
  effort: number;
};

export declare const OPPORTUNITY_WEIGHTS: Readonly<{
  strategicFit: 25;
  potentialValue: 25;
  urgency: 15;
  evidenceStrength: 20;
  executionEase: 15;
}>;

export declare function scoreOpportunity(opportunity: Partial<OpportunityScoreInput> | null | undefined): number;
export declare function opportunityPriority(score: number): "HIGH_SCORE" | "VALIDATE" | "HOLD";
export declare function priorityDescription(priority: string): string;
