const TOKEN_PRICES_USD_PER_MILLION = Object.freeze({
  // OpenAI published standard text pricing as of 2026-10-28.
  // Cached input is deliberately charged at the uncached input rate for a conservative estimate.
  "gpt-6-luna": Object.freeze({ input: 0.1, output: 0.5 }),
});

export function isSupportedCostModel(model) {
  return Object.prototype.hasOwnProperty.call(TOKEN_PRICES_USD_PER_MILLION, model);
}

export function estimateOpenAITextCost(model, promptTokens, completionTokens) {
  const price = TOKEN_PRICES_USD_PER_MILLION[model];
  if (!price) return null;
  if (
    !Number.isSafeInteger(promptTokens) || promptTokens < 0
    || !Number.isSafeInteger(completionTokens) || completionTokens < 0
  ) return null;

  const estimatedCostUsd = (
    (promptTokens * price.input) + (completionTokens * price.output)
  ) / 1_000_000;

  return {
    model,
    promptTokens,
    completionTokens,
    estimatedCostUsd: Math.round(estimatedCostUsd * 1e8) / 1e8,
    currency: "USD",
    pricingBasis: "OpenAI standard text rates; cached input charged at uncached input rate",
  };
}
