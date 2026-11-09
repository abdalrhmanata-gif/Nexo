import { NextResponse } from "next/server";
import { isSupportedCostModel } from "../opportunity-cost.mjs";

// The gates every paid-provider route passes through, in one place.
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

export function providerConfig(): ProviderConfig | null {
  // Two separate switches, both required.
  //
  // Production used to be blocked outright here, on the reasoning that a
  // feature flag could be flipped by accident. The cost of that caution was
  // that the only genuinely intelligent part of the product could never run
  // anywhere a visitor could see it: every brief on the live site answered
  // "AI analysis is not enabled on this deployment yet".
  //
  // So it is opt-in rather than impossible. One flag enables the path at all;
  // a second, which exists for nothing else, admits it to production. A
  // single flag set by mistake still opens nothing. Behind both still stand
  // the user allowlist, the persistent monthly quota, and a per-request cost
  // estimate recorded before the provider is called.
  if (process.env.ZAVQERA_AI_ENABLED !== "true") return null;
  if (process.env.CONTEXT === "production" && process.env.ZAVQERA_AI_ALLOW_PRODUCTION !== "true") return null;
  const baseUrl = process.env.ZAVQERA_AI_BASE_URL?.trim() || "https://api.openai.com/v1";
  const apiKey = process.env.ZAVQERA_AI_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim();
  const model = process.env.ZAVQERA_AI_MODEL?.trim() || process.env.OPENAI_MODEL?.trim();
  if (!apiKey || !model || !isSupportedCostModel(model)) return null;

  let url: URL;
  try { url = new URL(baseUrl); } catch { return null; }
  const localDevelopmentUrl = process.env.NODE_ENV !== "production"
    && url.protocol === "http:"
    && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if ((url.protocol !== "https:" && !localDevelopmentUrl) || url.username || url.password || url.search || url.hash) return null;
  // This route currently supports the official OpenAI API host only.
  if (url.hostname !== "api.openai.com" && !localDevelopmentUrl) return null;

  const rawLimit = Number(process.env.ZAVQERA_AI_MAX_COMPLETION_TOKENS ?? "1200");
  const maxCompletionTokens = Number.isInteger(rawLimit) ? Math.max(400, Math.min(1400, rawLimit)) : 1200;
  return { endpoint: `${baseUrl.replace(/\/+$/, "")}/chat/completions`, apiKey, model, maxCompletionTokens };
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
