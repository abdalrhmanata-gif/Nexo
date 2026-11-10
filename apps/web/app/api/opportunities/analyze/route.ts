import { randomUUID } from "node:crypto";
import { createSupabaseServerClient, getAuthenticatedUser } from "../../../../lib/supabase/server";
import { isSupabaseConfigured } from "../../../../lib/supabase/config";
import { isTrustedSameOriginRequest } from "../../../../lib/request-origin.mjs";
// The shared gates: allowlist, provider configuration, rate limit, bounded
// body and the error shape. One copy, used by every paid-provider route.
import {
  PROVIDER_TIMEOUT_MS,
  isApprovedPreviewTester,
  jsonError,
  noStoreHeaders,
  describeProvider,
  rateLimit,
  readLimitedBody,
} from "../../../../lib/ai/gate";
// One guarded path to the provider, shared with the mission-plan route: a
// second copy of this flow is a second place to forget the quota.
import { okJson, runGuardedJsonCompletion, usageMeta, type RunMessages } from "../../../../lib/ai/run";
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




const MESSAGES: RunMessages = {
  usageUnavailable: "Monthly AI usage could not be verified. No AI provider was called.",
  usageInvalidResponse: "Monthly AI usage returned an invalid response. No AI provider was called.",
  allowanceReached: "You've reached the monthly AI Opportunity Brief allowance.",
  reservationInvalid: "Monthly AI usage reservation is invalid. No AI provider was called.",
  reservationUnconfirmed: "The monthly usage reservation could not be confirmed. No AI provider was called.",
  providerRejectedCredentials: "The AI provider rejected this deployment's credentials. The API key may have expired, been revoked or been entered incorrectly. This attempt used one monthly generation.",
  providerFailed: "The AI provider could not complete this brief. This attempt used one monthly generation; no automatic retry was attempted.",
  providerUnreadable: "The AI provider returned an unreadable response. This attempt used one monthly generation.",
  providerUnsupported: "The AI provider returned an unsupported response. This attempt used one monthly generation.",
  reportMissing: "The AI provider did not return a complete report. This attempt used one monthly generation.",
  reportInvalidJson: "The AI provider returned a report that was not valid JSON. This attempt used one monthly generation.",
  reportRejected: "The report did not pass evidence-reference and structure checks. This attempt used one monthly generation.",
  timedOut: "The AI report timed out. This attempt used one monthly generation; no automatic retry was attempted.",
  failed: "The AI report could not be completed. This attempt used one monthly generation; no automatic retry was attempted.",
};

// Each refusal says what it is. "Not enabled yet" is true for one of these
// and misleading for the others, and a misleading message costs a day.
const PROVIDER_REFUSAL: Record<string, string> = {
  "disabled": "AI analysis is not enabled on this deployment yet. No AI provider was called.",
  "production-not-allowed": "AI is enabled but not permitted on production. Set ZAVQERA_AI_ALLOW_PRODUCTION to allow it here.",
  "no-key": "AI is enabled but no provider key is configured on this deployment.",
  "no-model": "AI is enabled but no model is configured on this deployment.",
  "unpriced-model": "The configured model has no published price in this application, so it will not be called. Use a model this deployment can cost.",
  "bad-base-url": "The configured provider address is not accepted. Only the official OpenAI API host is allowed.",
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

  const provider = describeProvider();
  if (!provider.ok) {
    return jsonError(503, "AI_ANALYSIS_NOT_CONFIGURED", PROVIDER_REFUSAL[provider.reason]);
  }
  const config = provider.config;

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

  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  try {
    supabase = await createSupabaseServerClient();
  } catch {
    return jsonError(503, "AI_USAGE_UNAVAILABLE", MESSAGES.usageUnavailable);
  }

  const run = await runGuardedJsonCompletion({
    supabase,
    config,
    prompt: buildOpportunityAnalysisPrompt(input),
    requestId: randomUUID(),
    generationKind: "research",
    maxReportChars: MAX_ANALYSIS_REPORT_CHARS,
    validate: (value) => validateOpportunityAnalysisReport(value, input.evidenceItems),
    messages: MESSAGES,
    costEvent: "ai_brief_usage",
  });
  if (!run.ok) return run.response;

  return okJson({
    report: run.report,
    meta: {
      score: input.score,
      priority: input.priority,
      evidenceNotesProvided: input.evidenceItems.length,
      omittedEvidenceNotes: input.omittedEvidenceCount,
      sourcesFetchedByZavqera: false,
      costEstimate: run.costEstimate,
      usage: usageMeta(run.quota),
    },
  });
}
