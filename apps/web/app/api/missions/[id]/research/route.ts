import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../../lib/supabase/server";
import { createSupabaseMissionRepository } from "../../../../../../lib/supabase/mission-repository";
import { requestMissionResearch } from "../../../../../../lib/ai-research";
import { runAiGeneration, AI_GENERATION_OUTCOMES } from "../../../../../../lib/ai-generation-service";
import { reserveAiGeneration, consumeAiGeneration, releaseAiGeneration } from "../../../../../../lib/ai-usage";

export const runtime = "nodejs";
export const maxDuration = 35;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Authentication is required." }, { status: 401 });

    const repository = await createSupabaseMissionRepository();
    const mission = await repository.getMission((await params).id);
    if (!mission) return NextResponse.json({ error: "Mission not found." }, { status: 404 });

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "AI execution is not configured yet." }, { status: 503 });

    const requestId = request.headers.get("x-request-id") || crypto.randomUUID();
    const result = await runAiGeneration({
      requestId,
      reserve: reserveAiGeneration,
      generate: () => requestMissionResearch(
        { name: mission.name, intent: mission.intent, criteria: mission.criteria },
        { apiKey, model: process.env.OPENAI_MODEL || "gpt-6-luna", requestId },
      ),
      consume: consumeAiGeneration,
      release: releaseAiGeneration,
    });

    if (result.kind === AI_GENERATION_OUTCOMES.QUOTA) {
      return NextResponse.json({ error: "Monthly AI limit reached." }, { status: 429 });
    }
    if (result.kind === AI_GENERATION_OUTCOMES.SETTLEMENT_FAILED) {
      return NextResponse.json({ error: "Research completed, but usage settlement is temporarily unavailable." }, { status: 503 });
    }
    if (result.kind === AI_GENERATION_OUTCOMES.PROVIDER_ERROR) {
      if (result.code === "RATE_LIMITED") return NextResponse.json({ error: "AI usage is temporarily limited. Please try again later." }, { status: 429 });
      if (result.disposition === "hold") return NextResponse.json({ error: "The research result is uncertain; please retry after reconciliation." }, { status: 504 });
      return NextResponse.json({ error: "Mission research is temporarily unavailable." }, { status: 502 });
    }

    return NextResponse.json(result.plan, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message === "AI_USAGE_UNAVAILABLE") {
      return NextResponse.json({ error: "AI usage service is temporarily unavailable." }, { status: 503 });
    }
    return NextResponse.json({ error: "Mission research was not completed." }, { status: 502 });
  }
}
