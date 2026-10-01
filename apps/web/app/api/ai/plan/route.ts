import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/supabase/server";
import { DEFAULT_AI_MODEL, requestMissionPlan } from "../../../../lib/ai-planner";
import { consumeAiGeneration, releaseAiGeneration, reserveAiGeneration } from "../../../../lib/ai-usage";

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

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
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
  let reservationId: string | null = null;

  try {
    const reservation = await reserveAiGeneration(requestId);
    if (!reservation.allowed || !reservation.reservation_id) {
      return NextResponse.json(
        {
          error: "Monthly AI limit reached.",
          usage: {
            plan: reservation.plan,
            monthlyLimit: reservation.monthly_limit,
            generationsUsed: reservation.generations_used,
            remaining: reservation.remaining,
          },
        },
        { status: 429 },
      );
    }
    reservationId = reservation.reservation_id;

    const plan = await requestMissionPlan(goal.trim(), {
      apiKey,
      model: process.env.OPENAI_MODEL || DEFAULT_AI_MODEL,
    });

    await consumeAiGeneration(reservationId);

    return NextResponse.json(plan, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (reservationId) await releaseAiGeneration(reservationId).catch(() => undefined);
    if (error instanceof Error && error.message === "AI_USAGE_UNAVAILABLE") {
      return NextResponse.json({ error: "AI usage service is temporarily unavailable." }, { status: 503 });
    }
    if (error instanceof Error && error.message === "RATE_LIMITED") {
      return NextResponse.json(
        { error: "AI usage is temporarily limited. Please try again later." },
        { status: 429 },
      );
    }
    return NextResponse.json(
      { error: "The AI planner is temporarily unavailable." },
      { status: 502 },
    );
  }
}
