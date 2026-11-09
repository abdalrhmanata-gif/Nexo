import { NextResponse } from "next/server";
import { estimateOpenAITextCost, type AiCostEstimate } from "../opportunity-cost.mjs";
import { PROVIDER_TIMEOUT_MS, jsonError, noStoreHeaders, type ProviderConfig } from "./gate";

// One guarded path to a paid provider, used by every route that needs one.
//
// The order here is the safety property, and it is easy to get subtly wrong
// in a second copy: reserve a generation, consume it *before* the provider is
// contacted so a timeout or a retry cannot slip past the quota, release it if
// the consume fails, then call the provider under a timeout, estimate the
// cost, and validate the answer before anyone sees it.
//
// Each route brings its own prompt, its own validator and its own wording.
// Nothing here reads a key: the config arrives already resolved by the gate,
// and the key never reaches a log, a response or a cost record.

export type AiUsageReservation = {
  allowed: boolean;
  reservation_id: string | null;
  period_start: string;
  plan: string;
  monthly_limit: number;
  generations_used: number;
  remaining: number;
};

/** Wording a route supplies so its failures read in its own terms. */
export type RunMessages = {
  usageUnavailable: string;
  usageInvalidResponse: string;
  allowanceReached: string;
  reservationInvalid: string;
  reservationUnconfirmed: string;
  providerFailed: string;
  providerUnreadable: string;
  providerUnsupported: string;
  reportMissing: string;
  reportInvalidJson: string;
  reportRejected: string;
  timedOut: string;
  failed: string;
};

type SupabaseLike = { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data?: unknown; error?: unknown }> };

export type GuardedRun<T> =
  | { ok: true; report: T; quota: AiUsageReservation; costEstimate: AiCostEstimate | null }
  | { ok: false; response: ReturnType<typeof jsonError> };

export async function runGuardedJsonCompletion<T>({
  supabase,
  config,
  prompt,
  requestId,
  maxReportChars,
  validate,
  messages,
  costEvent,
}: {
  supabase: SupabaseLike;
  config: ProviderConfig;
  prompt: { system: string; user: string };
  requestId: string;
  maxReportChars: number;
  validate: (value: unknown) => T;
  messages: RunMessages;
  costEvent: string;
}): Promise<GuardedRun<T>> {
  const fail = (status: number, code: string, message: string): GuardedRun<T> =>
    ({ ok: false, response: jsonError(status, code, message) });

  let reservationData: unknown;
  try {
    const result = await supabase.rpc("reserve_ai_generation", { p_request_id: requestId });
    if (result.error) return fail(503, "AI_USAGE_UNAVAILABLE", messages.usageUnavailable);
    reservationData = result.data;
  } catch {
    return fail(503, "AI_USAGE_UNAVAILABLE", messages.usageUnavailable);
  }

  const quotaValue = Array.isArray(reservationData) ? reservationData[0] : reservationData;
  if (!quotaValue || typeof quotaValue !== "object") {
    return fail(503, "AI_USAGE_UNAVAILABLE", messages.usageInvalidResponse);
  }
  const quota = quotaValue as AiUsageReservation;
  if (
    typeof quota.allowed !== "boolean"
    || typeof quota.plan !== "string"
    || typeof quota.monthly_limit !== "number"
    || typeof quota.generations_used !== "number"
    || typeof quota.remaining !== "number"
  ) {
    return fail(503, "AI_USAGE_UNAVAILABLE", messages.usageInvalidResponse);
  }
  if (!quota.allowed) {
    return { ok: false, response: jsonError(429, "AI_MONTHLY_LIMIT_REACHED", messages.allowanceReached, {
      usage: {
        plan: quota.plan,
        periodStart: quota.period_start,
        monthlyLimit: quota.monthly_limit,
        generationsUsed: quota.generations_used,
        remaining: quota.remaining,
      },
    }) };
  }
  if (typeof quota.reservation_id !== "string" || quota.reservation_id.length === 0) {
    return fail(503, "AI_USAGE_UNAVAILABLE", messages.reservationInvalid);
  }

  // The attempt counts before the provider is contacted, so a timeout or a
  // retry cannot buy a free generation.
  const release = async () => {
    try { await supabase.rpc("release_ai_generation", { p_reservation_id: quota.reservation_id }); } catch {
      // Fail closed: the provider is not called if usage cannot be finalized.
    }
  };
  try {
    const { data: consumed, error: consumeError } = await supabase.rpc("consume_ai_generation", {
      p_reservation_id: quota.reservation_id,
    });
    if (consumeError || consumed !== true) {
      await release();
      return fail(503, "AI_USAGE_FINALIZATION_FAILED", messages.reservationUnconfirmed);
    }
  } catch {
    await release();
    return fail(503, "AI_USAGE_FINALIZATION_FAILED", messages.reservationUnconfirmed);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
  try {
    const response = await fetch(config.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: "system", content: prompt.system },
          { role: "user", content: prompt.user },
        ],
        response_format: { type: "json_object" },
        max_completion_tokens: config.maxCompletionTokens,
      }),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) return fail(502, "AI_PROVIDER_ERROR", messages.providerFailed);

    let providerResponse: unknown;
    try { providerResponse = await response.json(); } catch {
      return fail(502, "AI_PROVIDER_INVALID_RESPONSE", messages.providerUnreadable);
    }
    if (
      !providerResponse || typeof providerResponse !== "object"
      || !("choices" in providerResponse)
      || !Array.isArray((providerResponse as { choices?: unknown }).choices)
    ) {
      return fail(502, "AI_PROVIDER_INVALID_RESPONSE", messages.providerUnsupported);
    }

    const usage = (providerResponse as { usage?: { prompt_tokens?: unknown; completion_tokens?: unknown } }).usage;
    const costEstimate = estimateOpenAITextCost(
      config.model,
      Number(usage?.prompt_tokens),
      Number(usage?.completion_tokens),
    );
    // Safe operational telemetry: no prompts, no user content, no user IDs,
    // no API key.
    console.warn("[zavqera-ai-cost]", JSON.stringify(costEstimate
      ? {
        event: costEvent,
        ...costEstimate,
        periodStart: quota.period_start,
        monthlyLimit: quota.monthly_limit,
        generationsUsed: quota.generations_used,
        remaining: quota.remaining,
      }
      : {
        event: `${costEvent}_missing`,
        model: config.model,
        periodStart: quota.period_start,
        monthlyLimit: quota.monthly_limit,
        generationsUsed: quota.generations_used,
      }));

    const choices = (providerResponse as { choices: Array<{ message?: { content?: unknown } }> }).choices;
    const content = choices[0]?.message?.content;
    if (typeof content !== "string" || content.length === 0 || content.length > maxReportChars) {
      return fail(502, "AI_REPORT_MISSING", messages.reportMissing);
    }

    let parsed: unknown;
    try { parsed = JSON.parse(content); } catch {
      return fail(502, "AI_REPORT_INVALID_JSON", messages.reportInvalidJson);
    }
    let report: T;
    try { report = validate(parsed); } catch {
      return fail(502, "AI_REPORT_VALIDATION_FAILED", messages.reportRejected);
    }

    return { ok: true, report, quota, costEstimate };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return fail(504, "AI_TIMEOUT", messages.timedOut);
    }
    return fail(502, "AI_FAILED", messages.failed);
  } finally {
    clearTimeout(timeout);
  }
}

export const usageMeta = (quota: AiUsageReservation) => ({
  plan: quota.plan,
  periodStart: quota.period_start,
  monthlyLimit: quota.monthly_limit,
  generationsUsed: quota.generations_used,
  remaining: quota.remaining,
});

export const okJson = (body: unknown) => NextResponse.json(body, { headers: noStoreHeaders });
