import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/supabase/server";
import { DEFAULT_AI_MODEL, requestMissionPlan } from "../../../../lib/ai-planner";
import { buildMockMissionPlan } from "../../../../lib/ai-mock-provider";
import {
  AI_GENERATION_OUTCOMES,
  runAiGeneration,
} from "../../../../lib/ai-generation-service";
import { reserveAiGeneration, consumeAiGeneration, releaseAiGeneration } from "../../../../lib/ai-usage";

export const runtime = "nodejs";
export const maxDuration = 20;

export async function POST(request: Request) {
  let user: Awaited<ReturnType<typeof getAuthenticatedUser>>;
  try {
    user = await getAuthenticatedUser();
  } catch {
    return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
  }
  if (!user) {
    return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
  }

  const providerMode = process.env.ZAVQERA_AI_PROVIDER_MODE || "openai";
  const apiKey = process.env.OPENAI_API_KEY;
  if (providerMode !== "mock" && !apiKey) {
    return NextResponse.json({ error: "AI planning is not configured yet." }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send a valid JSON request." }, { status: 400 });
  }

  const goal = typeof body === "object" && body !== null && "goal" in body
    ? (body as { goal?: unknown }).goal
    : undefined;
  if (typeof goal !== "string" || !goal.trim() || goal.trim().length > 1200) {
    return NextResponse.json(
      { error: "Enter a goal between 1 and 1,200 characters." },
      { status: 400 },
    );
  }

  const requestId = request.headers.get("x-request-id") || crypto.randomUUID();

  try {
    const result = await runAiGeneration({
      requestId,
      reserve: reserveAiGeneration,
      generate: () => providerMode === "mock"
        ? Promise.resolve(buildMockMissionPlan(goal.trim()))
        : requestMissionPlan(goal.trim(), {
          apiKey: apiKey as string,
          model: process.env.OPENAI_MODEL || DEFAULT_AI_MODEL,
        }),
      consume: consumeAiGeneration,
      release: releaseAiGeneration,
    });

    if (result.kind === AI_GENERATION_OUTCOMES.QUOTA) {
      return NextResponse.json(
        {
          error: "Monthly AI limit reached.",
          usage: {
            plan: result.reservation?.plan,
            monthlyLimit: result.reservation?.monthly_limit,
            generationsUsed: result.reservation?.generations_used,
            remaining: result.reservation?.remaining,
          },
        },
        { status: 429 },
      );
    }

    if (result.kind === AI_GENERATION_OUTCOMES.SETTLEMENT_FAILED) {
      return NextResponse.json(
        { error: "AI generation completed, but usage settlement is temporarily unavailable." },
        { status: 503 },
      );
    }

    if (result.kind === AI_GENERATION_OUTCOMES.PROVIDER_ERROR) {
      if (result.code === "RATE_LIMITED") {
        return NextResponse.json(
          { error: "AI usage is temporarily limited. Please try again later." },
          { status: 429 },
        );
      }
      if (result.disposition === "hold") {
        return NextResponse.json(
          { error: "The AI provider outcome is uncertain; please retry after reconciliation." },
          { status: 504 },
        );
      }
      return NextResponse.json(
        { error: "The AI planner is temporarily unavailable." },
        { status: 502 },
      );
    }

    return NextResponse.json(result.plan, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "AI_USAGE_UNAVAILABLE") {
      return NextResponse.json({ error: "AI usage service is temporarily unavailable." }, { status: 503 });
    }
    return NextResponse.json(
      { error: "The AI planner is temporarily unavailable." },
      { status: 502 },
    );
  }
}
