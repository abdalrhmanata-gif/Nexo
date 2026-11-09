import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createSupabaseServerClient, getAuthenticatedUser } from "../../../../lib/supabase/server";
import { isSupabaseConfigured } from "../../../../lib/supabase/config";
import { isTrustedSameOriginRequest } from "../../../../lib/request-origin.mjs";
import { estimateOpenAITextCost, type AiCostEstimate } from "../../../../lib/opportunity-cost.mjs";
// The shared gates: allowlist, provider configuration, rate limit, bounded
// body and the error shape. One copy, used by every paid-provider route.
import {
  PROVIDER_TIMEOUT_MS,
  isApprovedPreviewTester,
  jsonError,
  noStoreHeaders,
  providerConfig,
  rateLimit,
  readLimitedBody,
} from "../../../../lib/ai/gate";
import {
  buildOpportunityAnalysisPrompt,
  MAX_ANALYSIS_REPORT_CHARS,
  MAX_ANALYSIS_REQUEST_BYTES,
  normalizeOpportunityAnalysisRequest,
  validateOpportunityAnalysisReport,
  type OpportunityAnalysisInput,
  type OpportunityAnalysisReport,
} from "../../../../lib/opportunity-analysis.mjs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";



type AiUsageReservation = {
  allowed: boolean;
  reservation_id: string | null;
  period_start: string;
  plan: string;
  monthly_limit: number;
  generations_used: number;
  remaining: number;
};

export async function POST(request: Request) {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite === "cross-site" || !isTrustedSameOriginRequest(request)) {
    return jsonError(403, "CROSS_SITE_REQUEST", "This request is not allowed.");
  }
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return jsonError(415, "JSON_REQUIRED", "Send the opportunity brief as JSON.");
  }

  if (!isSupabaseConfigured()) {
    return jsonError(503, "AUTH_NOT_CONFIGURED", "Sign-in is not configured on this deployment.");
  }

  let user: Awaited<ReturnType<typeof getAuthenticatedUser>>;
  try {
    user = await getAuthenticatedUser();
  } catch {
    return jsonError(503, "AUTH_UNAVAILABLE", "Authentication is temporarily unavailable.");
  }
  if (!user) return jsonError(401, "AUTHENTICATION_REQUIRED", "Sign in to generate an AI Opportunity Brief.");
  if (!isApprovedPreviewTester(user.id)) {
    return jsonError(403, "AI_ACCESS_RESTRICTED", "AI Opportunity Brief is limited to approved preview testers.");
  }

  const config = providerConfig();
  if (!config) {
    return jsonError(503, "AI_ANALYSIS_NOT_CONFIGURED", "AI analysis is not enabled on this deployment yet. No AI provider was called.");
  }

  let rawBody: string;
  try {
    rawBody = await readLimitedBody(request, MAX_ANALYSIS_REQUEST_BYTES);
  } catch (error) {
    if (error instanceof Error && error.message === "BODY_TOO_LARGE") {
      return jsonError(413, "REQUEST_TOO_LARGE", "The brief is too large. Reduce the evidence notes and try again.");
    }
    return jsonError(400, "INVALID_REQUEST_BODY", "The request body could not be read.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return jsonError(400, "INVALID_JSON", "Send valid JSON.");
  }

  let input: OpportunityAnalysisInput;
  try {
    input = normalizeOpportunityAnalysisRequest(parsed);
  } catch (error) {
    return jsonError(400, "INVALID_ANALYSIS_INPUT", error instanceof Error ? error.message : "The opportunity input is invalid.");
  }

  const rate = rateLimit(user.id);
  if (!rate.allowed) {
    return jsonError(429, "ANALYSIS_RATE_LIMIT", "Too many briefs were requested. Wait a few minutes before trying again.", { retryAfterSeconds: rate.retryAfterSeconds });
  }

  const prompt = buildOpportunityAnalysisPrompt(input);

  // Enforce the durable monthly generation allowance in Supabase before any
  // paid provider request. Both RPCs run as the signed-in user via their cookie
  // session; direct table access remains blocked by RLS.
  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  try {
    supabase = await createSupabaseServerClient();
  } catch {
    return jsonError(503, "AI_USAGE_UNAVAILABLE", "Monthly AI usage could not be verified. No AI provider was called.");
  }

  let reservationData: unknown;
  try {
    const result = await supabase.rpc("reserve_ai_generation", { p_request_id: randomUUID() });
    if (result.error) {
      return jsonError(503, "AI_USAGE_UNAVAILABLE", "Monthly AI usage could not be verified. No AI provider was called.");
    }
    reservationData = result.data;
  } catch {
    return jsonError(503, "AI_USAGE_UNAVAILABLE", "Monthly AI usage could not be verified. No AI provider was called.");
  }

  const quotaValue = Array.isArray(reservationData) ? reservationData[0] : reservationData;
  if (!quotaValue || typeof quotaValue !== "object") {
    return jsonError(503, "AI_USAGE_UNAVAILABLE", "Monthly AI usage returned an invalid response. No AI provider was called.");
  }
  const quota = quotaValue as AiUsageReservation;
  if (
    typeof quota.allowed !== "boolean"
    || typeof quota.plan !== "string"
    || typeof quota.period_start !== "string"
    || !Number.isInteger(quota.monthly_limit)
    || !Number.isInteger(quota.generations_used)
    || !Number.isInteger(quota.remaining)
    || (quota.reservation_id !== null && typeof quota.reservation_id !== "string")
  ) {
    return jsonError(503, "AI_USAGE_UNAVAILABLE", "Monthly AI usage returned an invalid response. No AI provider was called.");
  }
  if (quota.allowed !== true) {
    return jsonError(429, "AI_MONTHLY_QUOTA_EXCEEDED", "You've reached the monthly AI Opportunity Brief allowance.", {
      usage: {
        plan: quota.plan,
        periodStart: quota.period_start,
        monthlyLimit: quota.monthly_limit,
        generationsUsed: quota.generations_used,
        remaining: quota.remaining,
      },
    });
  }
  if (typeof quota.reservation_id !== "string" || quota.reservation_id.length === 0) {
    return jsonError(503, "AI_USAGE_UNAVAILABLE", "Monthly AI usage reservation is invalid. No AI provider was called.");
  }

  // Treat an attempt as a consumed generation before contacting OpenAI. This
  // prevents retries/timeouts from bypassing the persistent per-user quota.
  try {
    const { data: consumed, error: consumeError } = await supabase.rpc("consume_ai_generation", {
      p_reservation_id: quota.reservation_id,
    });
    if (consumeError || consumed !== true) {
      try {
        await supabase.rpc("release_ai_generation", { p_reservation_id: quota.reservation_id });
      } catch {
        // Fail closed: the provider is not called if usage cannot be finalized.
      }
      return jsonError(503, "AI_USAGE_FINALIZATION_FAILED", "The monthly usage reservation could not be confirmed. No AI provider was called.");
    }
  } catch {
    try {
      await supabase.rpc("release_ai_generation", { p_reservation_id: quota.reservation_id });
    } catch {
      // Fail closed: the provider is not called if usage cannot be finalized.
    }
    return jsonError(503, "AI_USAGE_FINALIZATION_FAILED", "The monthly usage reservation could not be confirmed. No AI provider was called.");
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
    if (!response.ok) {
      return jsonError(502, "AI_PROVIDER_ERROR", "The AI provider could not complete this brief. This attempt used one monthly generation; no automatic retry was attempted.");
    }

    let providerResponse: unknown;
    try { providerResponse = await response.json(); } catch {
      return jsonError(502, "AI_PROVIDER_INVALID_RESPONSE", "The AI provider returned an unreadable response. This attempt used one monthly generation.");
    }
    if (!providerResponse || typeof providerResponse !== "object" || !("choices" in providerResponse) || !Array.isArray((providerResponse as { choices?: unknown }).choices)) {
      return jsonError(502, "AI_PROVIDER_INVALID_RESPONSE", "The AI provider returned an unsupported response. This attempt used one monthly generation.");
    }

    const usage = (providerResponse as {
      usage?: { prompt_tokens?: unknown; completion_tokens?: unknown };
    }).usage;
    const costEstimate: AiCostEstimate | null = estimateOpenAITextCost(
      config.model,
      Number(usage?.prompt_tokens),
      Number(usage?.completion_tokens),
    );
    if (costEstimate) {
      // Safe operational telemetry: no prompts, notes, user IDs, or API keys.
      console.warn("[zavqera-ai-cost]", JSON.stringify({
        event: "ai_brief_usage",
        ...costEstimate,
        periodStart: quota.period_start,
        monthlyLimit: quota.monthly_limit,
        generationsUsed: quota.generations_used,
        remaining: quota.remaining,
      }));
    } else {
      console.warn("[zavqera-ai-cost]", JSON.stringify({
        event: "ai_brief_usage_missing",
        model: config.model,
        periodStart: quota.period_start,
        monthlyLimit: quota.monthly_limit,
        generationsUsed: quota.generations_used,
      }));
    }

    const choices = (providerResponse as { choices: Array<{ message?: { content?: unknown } }> }).choices;
    const content = choices[0]?.message?.content;
    if (typeof content !== "string" || content.length === 0 || content.length > MAX_ANALYSIS_REPORT_CHARS) {
      return jsonError(502, "AI_REPORT_MISSING", "The AI provider did not return a complete report. This attempt used one monthly generation.");
    }

    let reportValue: unknown;
    try { reportValue = JSON.parse(content); } catch {
      return jsonError(502, "AI_REPORT_INVALID_JSON", "The AI provider returned a report that was not valid JSON. This attempt used one monthly generation.");
    }
    let report: OpportunityAnalysisReport;
    try { report = validateOpportunityAnalysisReport(reportValue, input.evidenceItems); } catch {
      return jsonError(502, "AI_REPORT_VALIDATION_FAILED", "The report did not pass evidence-reference and structure checks. This attempt used one monthly generation.");
    }

    return NextResponse.json({
      report,
      meta: {
        score: input.score,
        priority: input.priority,
        evidenceNotesProvided: input.evidenceItems.length,
        omittedEvidenceNotes: input.omittedEvidenceCount,
        sourcesFetchedByZavqera: false,
        costEstimate,
        usage: {
          plan: quota.plan,
          periodStart: quota.period_start,
          monthlyLimit: quota.monthly_limit,
          generationsUsed: quota.generations_used,
          remaining: quota.remaining,
        },
      },
    }, { headers: noStoreHeaders });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return jsonError(504, "AI_ANALYSIS_TIMEOUT", "The AI report timed out. This attempt used one monthly generation; no automatic retry was attempted.");
    }
    return jsonError(502, "AI_ANALYSIS_FAILED", "The AI report could not be completed. This attempt used one monthly generation; no automatic retry was attempted.");
  } finally {
    clearTimeout(timeout);
  }
}
