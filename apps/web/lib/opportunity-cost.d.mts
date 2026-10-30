export type AiCostEstimate = {
  model: string;
  promptTokens: number;
  completionTokens: number;
  estimatedCostUsd: number;
  currency: "USD";
  pricingBasis: string;
};

export function isSupportedCostModel(model: string): boolean;
export function estimateOpenAITextCost(
  model: string,
  promptTokens: number,
  completionTokens: number,
): AiCostEstimate | null;
