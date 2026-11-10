import { NextResponse } from "next/server";
import { isSupportedCostModel } from "../opportunity-cost.mjs";

// The gates every paid-provider route passes through, in one place.
// Production is intentionally opt-in and remains allowlist-scoped while launch is verified.
//
// These were private to the opportunity-brief route. A second route needs the
// same ones, and a security gate copied into two files is a gate that gets
// fixed in one of them: the duplicate keeps the hole and nothing says so.
//
// Nothing here reads or returns a key's value. providerConfig answers whether
// a usable provider exists and hands back the pieces a request needs; the key
// itself is set in the hosting environment and never appears in a log, a
// response or a test.

const REQUEST_WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 3;
const inMemoryUserRequests = new Map<string, number[]>();

export const PROVIDER_TIMEOUT_MS = 25_000;
export const noStoreHeaders = { "Cache-Control": "no-store, max-age=0", Vary: "Cookie" };

export type ProviderConfig = { endpoint: string; apiKey: string; model: string; maxCompletionTokens: number };

export function isApprovedPreviewTester(userId: string): boolean {
  const configured = process.env.ZAVQERA_AI_ALLOWED_USER_IDS?.trim();
  if (!configured) return false;
  const allowlist = configured.split(",").map((value) => value.trim()).filter(Boolean);
  return allowlist.includes(userId);
}

/** Why a provider is not usable, when it is not. */
export type ProviderRefusal =
  | "disabled"
  | "production-not-allowed"
  | "no-key"
  | "no-model"
  | "unpriced-model"
  | "bad-base-url";

export type ProviderResult =
  | { ok: true; config: ProviderConfig }
  | { ok: false; reason: ProviderRefusal };

/**
 * Why this reports a reason rather than returning null.
 *
 * Every refusal used to collapse into "AI analysis is not enabled on this
 * deployment yet". That sentence is true for one of them and misleading for
 * the rest: a model name absent from the price table reads as a feature that
 * was never switched on, and the owner goes looking for a flag that is
 * already set. The same silent-failure shape as an expired key.
 *
 * The reason is safe to act on because every caller checks the allowlist
 * first, so only an approved tester ever learns anything about how this
 * deployment is configured.
 */
export function describeProvider(): ProviderResult {
  // Two separate switches, both required.
  //
  // Production used to be blocked outright here, on the reasoning that a
  // feature flag could be flipped by accident. The cost of that caution was
  // that the only genuinely intelligent part of the product could never run
  // anywhere a visitor could see it. So it is opt-in rather than impossible,
  // and a single flag set by mistake still opens nothing. Behind both stand
  // the user allowlist, the monthly quota and a per-request cost estimate.
  if (process.env.ZAVQERA_AI_ENABLED !== "true") return { ok: false, reason: "disabled" };
  if (process.env.CONTEXT === "production" && process.env.ZAVQERA_AI_ALLOW_PRODUCTION !== "true") {
    return { ok: false, reason: "production-not-allowed" };
  }

  const baseUrl = process.env.ZAVQERA_AI_BASE_URL?.trim() || "https://api.openai.com/v1";
  const apiKey = process.env.ZAVQERA_AI_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim();
  const model = process.env.ZAVQERA_AI_MODEL?.trim() || process.env.OPENAI_MODEL?.trim();
  if (!apiKey) return { ok: false, reason: "no-key" };
  if (!model) return { ok: false, reason: "no-model" };
  // A model with no published price cannot be billed honestly, so it is not
  // called. That is a deliberate refusal, not a missing feature.
  if (!isSupportedCostModel(model)) return { ok: false, reason: "unpriced-model" };

  let url: URL;
  try { url = new URL(baseUrl); } catch { return { ok: false, reason: "bad-base-url" }; }
  const localDevelopmentUrl = process.env.NODE_ENV !== "production"
    && url.protocol === "http:"
    && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if ((url.protocol !== "https:" && !localDevelopmentUrl) || url.username || url.password || url.search || url.hash) {
    return { ok: false, reason: "bad-base-url" };
  }
  // The official OpenAI API host only, unless running locally.
  if (url.hostname !== "api.openai.com" && !localDevelopmentUrl) return { ok: false, reason: "bad-base-url" };

  const rawLimit = Number(process.env.ZAVQERA_AI_MAX_COMPLETION_TOKENS ?? "1200");
  const maxCompletionTokens = Number.isInteger(rawLimit) ? Math.max(400, Math.min(1400, rawLimit)) : 1200;
  return {
    ok: true,
    config: { endpoint: `${baseUrl.replace(/\/+$/, "")}/chat/completions`, apiKey, model, maxCompletionTokens },
  };
}

/** The config when there is one, for callers that do not report the reason. */
export function providerConfig(): ProviderConfig | null {
  const result = describeProvider();
  return result.ok ? result.config : null;
}

export function rateLimit(userId: string, now = Date.now()): { allowed: boolean; retryAfterSeconds: number } {
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

export async function readLimitedBody(request: Request, maximumBytes: number): Promise<string> {
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

export function jsonError(status: number, code: string, error: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error, code, ...extra }, { status, headers: noStoreHeaders });
}
