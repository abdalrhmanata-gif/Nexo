import { createHash, createHmac } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { DEFAULT_AI_MODEL, requestMissionPlan } from "../../../../../lib/ai-planner";
import { buildMockMissionPlan } from "../../../../../lib/ai-mock-provider";
import {
  consumeAnonymousAiGeneration,
  releaseAnonymousAiGeneration,
  reserveAnonymousAiGeneration,
} from "../../../../../lib/anonymous-ai-usage";

export const runtime = "nodejs";
export const maxDuration = 20;

const VISITOR_COOKIE = "zavqera-anon-ai";
const MAX_GOAL_LENGTH = 900;

function getClientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")?.trim()
    || "unknown";
}

function hashVisitor(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function hashWithSalt(value: string, salt: string) {
  return createHmac("sha256", salt).update(value).digest("hex");
}

function withVisitorCookie(response: NextResponse, token: string, shouldSet: boolean) {
  if (shouldSet) {
    response.cookies.set(VISITOR_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
    });
  }
  return response;
}

function errorResponse(message: string, status: number, token: string, shouldSet: boolean) {
  return withVisitorCookie(NextResponse.json({ error: message }, { status }), token, shouldSet);
}

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const existingToken = cookieStore.get(VISITOR_COOKIE)?.value;
  const visitorToken = existingToken || crypto.randomUUID();
  const shouldSetCookie = !existingToken;

  const salt = process.env.ZAVQERA_ANONYMOUS_AI_SALT;
  if (!salt) {
    return errorResponse("Anonymous AI planning is not configured yet.", 503, visitorToken, shouldSetCookie);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Send a valid JSON request.", 400, visitorToken, shouldSetCookie);
  }

  const goal = typeof body === "object" && body !== null && "goal" in body
    ? (body as { goal?: unknown }).goal
    : undefined;

  if (typeof goal !== "string" || !goal.trim() || goal.trim().length > MAX_GOAL_LENGTH) {
    return errorResponse(
      "Enter a goal between 1 and 900 characters.",
      400,
      visitorToken,
      shouldSetCookie,
    );
  }

  const configuredProviderMode = process.env.ZAVQERA_AI_PROVIDER_MODE || "openai";
  // Never allow an accidental mock provider in a deployed Netlify runtime.
  // Local development/tests can still opt into mock mode explicitly.
  const isDeployedRuntime = process.env.NETLIFY === "true" || Boolean(process.env.CONTEXT);
  const providerMode = configuredProviderMode === "mock" && !isDeployedRuntime ? "mock" : "openai";
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return errorResponse("AI planning is not configured yet.", 503, visitorToken, shouldSetCookie);
  }

  const visitorHash = hashVisitor(visitorToken);
  const ipHash = hashWithSalt(getClientIp(request), salt);
  const requestId = crypto.randomUUID();

  let reservation: Awaited<ReturnType<typeof reserveAnonymousAiGeneration>>;
  try {
    reservation = await reserveAnonymousAiGeneration(visitorHash, ipHash, requestId);
  } catch {
    return errorResponse("AI planning is temporarily unavailable.", 503, visitorToken, shouldSetCookie);
  }

  if (!reservation.allowed || !reservation.reservation_id) {
    const message = reservation.reason === "ip_limit"
      ? "Anonymous AI planning is temporarily limited. Create an account to continue."
      : "Your free AI plan has already been used. Create an account to continue.";
    return errorResponse(message, 429, visitorToken, shouldSetCookie);
  }

  const reservationId = reservation.reservation_id;

  try {
    const plan = providerMode === "mock"
      ? buildMockMissionPlan(goal.trim())
      : await requestMissionPlan(goal.trim(), {
        apiKey: apiKey as string,
        model: process.env.OPENAI_MODEL || DEFAULT_AI_MODEL,
      });

    await consumeAnonymousAiGeneration(reservationId);

    return withVisitorCookie(
      NextResponse.json({
        ...plan,
        provider_mode: providerMode,
        anonymous: true,
        remaining: 0,
      }, {
        headers: { "Cache-Control": "no-store" },
      }),
      visitorToken,
      shouldSetCookie,
    );
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";

    if (code === "RATE_LIMITED" || code === "UPSTREAM_REJECTED") {
      await releaseAnonymousAiGeneration(reservationId).catch(() => undefined);
      return errorResponse(
        code === "RATE_LIMITED"
          ? "AI usage is temporarily limited. Please try again later."
          : "The AI planner could not accept this request. Please try again.",
        code === "RATE_LIMITED" ? 429 : 502,
        visitorToken,
        shouldSetCookie,
      );
    }

    // For timeouts, 5xx responses, or unknown provider outcomes, keep the
    // reservation consumed/held rather than risk giving a second free call
    // after a provider may already have charged the first one.
    return errorResponse(
      "The AI planner could not confirm the result. Please create an account to continue.",
      504,
      visitorToken,
      shouldSetCookie,
    );
  }
}
