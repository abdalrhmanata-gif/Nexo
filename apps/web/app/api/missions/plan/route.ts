import { randomUUID } from "node:crypto";
import { createSupabaseServerClient, getAuthenticatedUser } from "../../../../lib/supabase/server";
import { isSupabaseConfigured } from "../../../../lib/supabase/config";
import { isTrustedSameOriginRequest } from "../../../../lib/request-origin.mjs";
import {
  isApprovedPreviewTester,
  jsonError,
  describeProvider,
  rateLimit,
  readLimitedBody,
} from "../../../../lib/ai/gate";
import { okJson, runGuardedJsonCompletion, usageMeta, type RunMessages } from "../../../../lib/ai/run";
import {
  MAX_PLAN_REPORT_CHARS,
  MAX_PLAN_REQUEST_BYTES,
  buildMissionPlanPrompt,
  normalizeMissionPlanRequest,
  validateMissionPlanReport,
} from "../../../../lib/mission-plan-ai.mjs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// A plan for a mission, from a model, under the same gates as the brief.
//
// The deterministic planner stays: it is what answers when the AI is off, and
// it costs nothing. This is the path for the missions it cannot help with —
// which is most of them, since it knows six domains by keyword.

const MESSAGES: RunMessages = {
  usageUnavailable: "Monthly AI usage could not be verified. No AI provider was called.",
  usageInvalidResponse: "Monthly AI usage returned an invalid response. No AI provider was called.",
  allowanceReached: "You've reached the monthly AI allowance for this plan.",
  reservationInvalid: "Monthly AI usage reservation is invalid. No AI provider was called.",
  reservationUnconfirmed: "The monthly usage reservation could not be confirmed. No AI provider was called.",
  providerRejectedCredentials: "The AI provider rejected this deployment's credentials. The API key may have expired, been revoked or been entered incorrectly. This attempt used one monthly generation.",
  providerFailed: "The AI provider could not draft this plan. This attempt used one monthly generation; no automatic retry was attempted.",
  providerUnreadable: "The AI provider returned an unreadable response. This attempt used one monthly generation.",
  providerUnsupported: "The AI provider returned an unsupported response. This attempt used one monthly generation.",
  reportMissing: "The AI provider did not return a complete plan. This attempt used one monthly generation.",
  reportInvalidJson: "The AI provider returned a plan that was not valid JSON. This attempt used one monthly generation.",
  // The validator rejects a plan that states a fee, a duration or a link.
  // Saying so plainly is better than a vague failure: it tells the person
  // what the product refuses to do, which is the point of the product.
  reportRejected: "The draft plan stated figures or links it cannot verify, so it was discarded. This attempt used one monthly generation.",
  timedOut: "The AI plan timed out. This attempt used one monthly generation; no automatic retry was attempted.",
  failed: "The AI plan could not be completed. This attempt used one monthly generation; no automatic retry was attempted.",
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

/**
 * Is this deployment ready to draft a plan, and if not, which gate is shut?
 *
 * Until now the only way to find out was to press the button, which spends a
 * monthly generation to learn that the model name has a typo in it. This
 * answers the same question for nothing: it reads configuration and returns,
 * touching neither the provider nor the quota.
 *
 * It is behind the same allowlist as the POST, so only an approved tester
 * learns anything about how this deployment is set up. Everyone else gets
 * the same 403 they would get from the POST, and the panel stays hidden.
 */
export async function GET() {
  if (!isSupabaseConfigured()) {
    return jsonError(503, "AUTH_NOT_CONFIGURED", "Sign-in is not configured on this deployment.");
  }
  let user: Awaited<ReturnType<typeof getAuthenticatedUser>>;
  try {
    user = await getAuthenticatedUser();
  } catch {
    return jsonError(503, "AUTH_UNAVAILABLE", "Authentication is temporarily unavailable.");
  }
  if (!user) return jsonError(401, "AUTH_REQUIRED", "Sign in to draft a plan with AI.");
  if (!isApprovedPreviewTester(user.id)) {
    return jsonError(403, "AI_ACCESS_RESTRICTED", "AI planning is limited to approved preview testers.");
  }

  const provider = describeProvider();
  return okJson(provider.ok
    ? { ready: true }
    : { ready: false, reason: provider.reason, detail: PROVIDER_REFUSAL[provider.reason] });
}

export async function POST(request: Request) {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite === "cross-site" || !isTrustedSameOriginRequest(request)) {
    return jsonError(403, "CROSS_SITE_REQUEST", "This request is not allowed.");
  }
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return jsonError(415, "JSON_REQUIRED", "Send the mission as JSON.");
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
  if (!user) {
    return jsonError(401, "AUTH_REQUIRED", "Sign in to draft a plan with AI.");
  }
  // Unapproved testers are turned away before any provider configuration is
  // read, so an allowlist mistake cannot leak which providers are set up.
  if (!isApprovedPreviewTester(user.id)) {
    return jsonError(403, "AI_ACCESS_RESTRICTED", "AI planning is limited to approved preview testers.");
  }

  const provider = describeProvider();
  if (!provider.ok) {
    return jsonError(503, "AI_ANALYSIS_NOT_CONFIGURED", PROVIDER_REFUSAL[provider.reason]);
  }
  const config = provider.config;

  let rawBody: string;
  try {
    rawBody = await readLimitedBody(request, MAX_PLAN_REQUEST_BYTES);
  } catch (error) {
    if (error instanceof Error && error.message === "BODY_TOO_LARGE") {
      return jsonError(413, "REQUEST_TOO_LARGE", "The mission is too long. Shorten the intent and try again.");
    }
    return jsonError(400, "BODY_UNREADABLE", "The request body could not be read.");
  }

  let input: ReturnType<typeof normalizeMissionPlanRequest>;
  try {
    input = normalizeMissionPlanRequest(JSON.parse(rawBody));
  } catch {
    return jsonError(400, "INVALID_REQUEST", "The mission input is invalid.");
  }

  const limit = rateLimit(user.id);
  if (!limit.allowed) {
    return jsonError(429, "RATE_LIMITED", "Too many plans were requested. Wait a few minutes before trying again.", {
      retryAfterSeconds: limit.retryAfterSeconds,
    });
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
    prompt: buildMissionPlanPrompt(input),
    requestId: randomUUID(),
    maxReportChars: MAX_PLAN_REPORT_CHARS,
    validate: validateMissionPlanReport,
    messages: MESSAGES,
    costEvent: "ai_plan_usage",
  });
  if (!run.ok) return run.response;

  return okJson({
    plan: run.report,
    meta: {
      // Stated every time, because it is the difference between this plan and
      // one that sounds authoritative: nothing here was looked up.
      sourcesFetchedByZavqera: false,
      costEstimate: run.costEstimate,
      usage: usageMeta(run.quota),
    },
  });
}
