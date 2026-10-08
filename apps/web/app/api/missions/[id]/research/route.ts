import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/supabase/server";
import { createSupabaseMissionRepository } from "../../../../../lib/supabase/mission-repository";
import { buildMockMissionResearch, requestMissionResearch, type MissionResearch } from "../../../../../lib/ai-research";
import { runAiGeneration, AI_GENERATION_OUTCOMES } from "../../../../../lib/ai-generation-service";
import { reserveAiGeneration, consumeAiGeneration, releaseAiGeneration } from "../../../../../lib/ai-usage";

export const runtime = "nodejs";
export const maxDuration = 35;

function isTerminalLifecycle(status: string) {
  return status === "COMPLETED" || status === "CANCELLED";
}

function normaliseRequestId(request: Request) {
  const supplied = request.headers.get("x-request-id")?.trim();
  return supplied && supplied.length >= 16 && supplied.length <= 200 ? supplied : crypto.randomUUID();
}

async function authenticatedMission(missionId: string) {
  const user = await getAuthenticatedUser();
  if (!user) return { error: NextResponse.json({ error: "Authentication is required." }, { status: 401 }) } as const;
  const repository = await createSupabaseMissionRepository();
  const mission = await repository.getMission(missionId);
  if (!mission) return { error: NextResponse.json({ error: "Mission not found." }, { status: 404 }) } as const;
  return { repository, mission } as const;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authenticatedMission((await params).id);
    if ("error" in auth) return auth.error;
    const runs = await auth.repository.listResearchRuns?.(auth.mission.id) ?? [];
    return NextResponse.json({ runs }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Research history could not be loaded." }, { status: 503 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authenticatedMission((await params).id);
    if ("error" in auth) return auth.error;
    const { repository, mission } = auth;

    if (isTerminalLifecycle(mission.lifecycleStatus)) {
      return NextResponse.json({ error: "This mission is closed. Create a new mission for additional research." }, { status: 422 });
    }

    const requestId = normaliseRequestId(request);
    const configuredProviderMode = process.env.ZAVQERA_AI_PROVIDER_MODE || "openai";
    const isProductionRuntime = process.env.NODE_ENV === "production";
    const providerMode = configuredProviderMode === "mock" && !isProductionRuntime ? "mock" : "openai";
    const apiKey = process.env.OPENAI_API_KEY;
    if (providerMode !== "mock" && !apiKey) {
      return NextResponse.json({ error: "AI execution is not configured yet." }, { status: 503 });
    }

    const result = await runAiGeneration({
      requestId,
      reserve: reserveAiGeneration,
      generate: () => providerMode === "mock"
        ? Promise.resolve(buildMockMissionResearch({ name: mission.name, intent: mission.intent, criteria: mission.criteria }))
        : requestMissionResearch(
          { name: mission.name, intent: mission.intent, criteria: mission.criteria },
          { apiKey: apiKey as string, model: process.env.OPENAI_MODEL || "gpt-6-luna", requestId },
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

    const research = result.plan as MissionResearch;
    const runId = crypto.randomUUID();
    let historyPersisted = true;
    try {
      await repository.recordResearchRun?.({
        missionId: mission.id,
        runId,
        requestId,
        summary: research.summary,
        sources: research.sources,
      });
    } catch {
      historyPersisted = false;
    }

    return NextResponse.json(
      {
        ...research,
        run: {
          runId,
          status: "COMPLETED",
          createdAt: new Date().toISOString(),
          verified: false,
        },
        history_persisted: historyPersisted,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof Error && error.message === "AI_USAGE_UNAVAILABLE") {
      return NextResponse.json({ error: "AI usage service is temporarily unavailable." }, { status: 503 });
    }
    return NextResponse.json({ error: "Mission research was not completed." }, { status: 502 });
  }
}
