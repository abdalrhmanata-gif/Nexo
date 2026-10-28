import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/supabase/server";
import { isSupabaseConfigured } from "../../../../lib/supabase/config";
import { isTrustedSameOriginRequest } from "../../../../lib/request-origin.mjs";
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

const REQUEST_WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 3;
const PROVIDER_TIMEOUT_MS = 25_000;
const inMemoryUserRequests = new Map<string, number[]>();

const noStoreHeaders = { "Cache-Control": "no-store, max-age=0", Vary: "Cookie" };

type ProviderConfig = { endpoint: string; apiKey: string; model: string; maxCompletionTokens: number };

function providerConfig(): ProviderConfig | null {
  if (process.env.ZAVQERA_AI_ENABLED !== "true") return null;
  const baseUrl = process.env.ZAVQERA_AI_BASE_URL?.trim();
  const apiKey = process.env.ZAVQERA_AI_API_KEY?.trim();
  const model = process.env.ZAVQERA_AI_MODEL?.trim();
  if (!baseUrl || !apiKey || !model) return null;

  let url: URL;
  try { url = new URL(baseUrl); } catch { return null; }
  const localDevelopmentUrl = process.env.NODE_ENV !== "production"
    && url.protocol === "http:"
    && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if ((url.protocol !== "https:" && !localDevelopmentUrl) || url.username || url.password || url.search || url.hash) return null;

  const rawLimit = Number(process.env.ZAVQERA_AI_MAX_COMPLETION_TOKENS ?? "1200");
  const maxCompletionTokens = Number.isInteger(rawLimit) ? Math.max(400, Math.min(1400, rawLimit)) : 1200;
  return { endpoint: `${baseUrl.replace(/\/+$/, "")}/chat/completions`, apiKey, model, maxCompletionTokens };
}

function rateLimit(userId: string, now = Date.now()): { allowed: boolean; retryAfterSeconds: number } {
  if (inMemoryUserRequests.size > 5000) {
    inMemoryUserRequests.forEach((timestamps: number[], key: string) => {
      const remaining = timestamps.filter((timestamp: number) => now - timestamp < REQUEST_WINDOW_MS);
      if (remaining.length) inMemoryUserRequests.set(key, remaining);
      else inMemoryUserRequests.delete(key);
    });
  }
  const active = (inMemoryUserRequests.get(userId) ?? []).filter((timestamp) => now - timestamp < REQUEST_WINDOW_MS);
  if (active.length >= MAX_REQUESTS_PER_WINDOW) {
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((REQUEST_WINDOW_MS - (now - active[0])) / 1000)) };
  }
  active.push(now);
  inMemoryUserRequests.set(userId, active);
  return { allowed: true, retryAfterSeconds: 0 };
}

async function readLimitedBody(request: Request, maximumBytes: number): Promise<string> {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel();
        throw new Error("BODY_TOO_LARGE");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(joined);
}

function jsonError(status: number, code: string, error: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error, code, ...extra }, { status, headers: noStoreHeaders });
}

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
      return jsonError(502, "AI_PROVIDER_ERROR", "The AI provider could not complete this brief. No automatic retry was attempted.");
    }

    let providerResponse: unknown;
    try { providerResponse = await response.json(); } catch {
      return jsonError(502, "AI_PROVIDER_INVALID_RESPONSE", "The AI provider returned an unreadable response.");
    }
    if (!providerResponse || typeof providerResponse !== "object" || !("choices" in providerResponse) || !Array.isArray((providerResponse as { choices?: unknown }).choices)) {
      return jsonError(502, "AI_PROVIDER_INVALID_RESPONSE", "The AI provider returned an unsupported response.");
    }

    const choices = (providerResponse as { choices: Array<{ message?: { content?: unknown } }> }).choices;
    const content = choices[0]?.message?.content;
    if (typeof content !== "string" || content.length === 0 || content.length > MAX_ANALYSIS_REPORT_CHARS) {
      return jsonError(502, "AI_REPORT_MISSING", "The AI provider did not return a complete report.");
    }

    let reportValue: unknown;
    try { reportValue = JSON.parse(content); } catch {
      return jsonError(502, "AI_REPORT_INVALID_JSON", "The AI provider returned a report that was not valid JSON.");
    }
    let report: OpportunityAnalysisReport;
    try { report = validateOpportunityAnalysisReport(reportValue, input.evidenceItems); } catch {
      return jsonError(502, "AI_REPORT_VALIDATION_FAILED", "The report did not pass evidence-reference and structure checks. Review your evidence or try again later.");
    }

    return NextResponse.json({
      report,
      meta: {
        score: input.score,
        priority: input.priority,
        evidenceNotesProvided: input.evidenceItems.length,
        omittedEvidenceNotes: input.omittedEvidenceCount,
        sourcesFetchedByZavqera: false,
      },
    }, { headers: noStoreHeaders });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return jsonError(504, "AI_ANALYSIS_TIMEOUT", "The AI report timed out. No automatic retry was attempted.");
    }
    return jsonError(502, "AI_ANALYSIS_FAILED", "The AI report could not be completed. No automatic retry was attempted.");
  } finally {
    clearTimeout(timeout);
  }
}
