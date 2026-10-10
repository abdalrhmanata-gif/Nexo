import { NextResponse } from "next/server";
import { getAuthenticatedUser, createSupabaseServerClient } from "../../../../../lib/supabase/server";
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
  const supabase = await createSupabaseServerClient();
  const mission = await repository.getMission(missionId);
  if (!mission) return { error: NextResponse.json({ error: "Mission not found." }, { status: 404 }) } as const;
  return { repository, supabase, mission } as const;
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
    const { repository, supabase, mission } = auth;

    if (isTerminalLifecycle(mission.lifecycleStatus)) {
      return NextResponse.json({ error: "This mission is closed. Create a new mission for additional research." }, { status: 422 });
    }

    const requestId = normaliseRequestId(request);
    const agents = await repository.listWorkspaceAgents?.() ?? [];
    const researchAgent = agents.find((agent) =>
      agent.status === "ACTIVE"
      && agent.name === "ZAVQERA Research Agent"
      && agent.authority?.mode === "read_only"
      && agent.authority?.external_side_effects === false
    );
    if (!researchAgent) {
      return NextResponse.json({ error: "No active research agent is available for this workspace." }, { status: 503 });
    }
    const agentId = researchAgent.id;
    const configuredProviderMode = process.env.ZAVQERA_AI_PROVIDER_MODE || "openai";
    const isProductionRuntime = process.env.NODE_ENV === "production";
    const providerMode = configuredProviderMode === "mock" && !isProductionRuntime ? "mock" : "openai";
    const apiKey = process.env.OPENAI_API_KEY;
    if (providerMode !== "mock" && !apiKey) {
      return NextResponse.json({ error: "AI execution is not configured yet." }, { status: 503 });
    }

    let executionId: string | null = null;
    const result = await runAiGeneration({
      requestId,
      reserve: reserveAiGeneration,
      prepare: async () => {
        // The execution/approval gate must succeed before any data is sent to
        // the external AI provider. This callback runs after quota reservation
        // but before generate(), and a denied gate releases the unused quota.
        const execution = await supabase.rpc("start_agent_execution", {
          p_mission_id: mission.id,
          p_action_id: null,
          p_agent_id: agentId,
          p_idempotency_key: `research-${requestId}`,
          p_request: { type: "read_only_research", request_id: requestId },
        });
        if (execution.error) {
          if (execution.error.message === "APPROVAL_REQUIRED") {
            throw new Error("AGENT_APPROVAL_REQUIRED");
          }
          if (execution.error.message === "EXECUTION_ALREADY_EXISTS") {
            throw new Error("AGENT_EXECUTION_ALREADY_EXISTS");
          }
          throw new Error("AGENT_EXECUTION_START_FAILED");
        }
        executionId = (execution.data as { id: string }).id;
      },
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

    const startedExecutionId = executionId;
    if (result.kind === AI_GENERATION_OUTCOMES.SETTLEMENT_FAILED) {
      if (startedExecutionId) {
        const completion = await supabase.rpc("complete_agent_execution", {
          p_execution_id: startedExecutionId,
          p_status: "UNKNOWN",
          p_result: { reason: "AI_USAGE_SETTLEMENT_FAILED" },
          p_evidence: { outcome: "UNKNOWN", verified: false, request_id: requestId },
        });
        if (completion.error) {
          return NextResponse.json({ error: "Research may have completed, but execution recovery evidence could not be recorded." }, { status: 503 });
        }
      }
      return NextResponse.json({ error: "Research completed, but usage settlement is temporarily unavailable." }, { status: 503 });
    }

    if (result.kind === AI_GENERATION_OUTCOMES.PROVIDER_ERROR) {
      if (startedExecutionId) {
        const executionStatus = result.disposition === "hold" ? "UNKNOWN" : "FAILED";
        const completion = await supabase.rpc("complete_agent_execution", {
          p_execution_id: startedExecutionId,
          p_status: executionStatus,
          p_result: { reason: result.code },
          p_evidence: { outcome: executionStatus, verified: false, request_id: requestId },
        });
        if (completion.error) {
          return NextResponse.json({ error: "The research attempt could not be safely reconciled. Inspect execution history before retrying." }, { status: 503 });
        }
      }
      if (result.code === "AGENT_APPROVAL_REQUIRED") {
        return NextResponse.json({ error: "This agent requires human approval before execution." }, { status: 409 });
      }
      if (result.code === "AGENT_EXECUTION_ALREADY_EXISTS") {
        return NextResponse.json({ error: "An attempt with this request ID already exists. Inspect execution history before starting another attempt." }, { status: 409 });
      }
      if (result.code === "AGENT_EXECUTION_START_FAILED") {
        return NextResponse.json({ error: "The agent execution boundary could not be opened." }, { status: 503 });
      }
      if (result.code === "RATE_LIMITED") return NextResponse.json({ error: "AI usage is temporarily limited. Please try again later." }, { status: 429 });
      if (result.disposition === "hold") return NextResponse.json({ error: "The research result is uncertain; please retry after reconciliation." }, { status: 504 });
      return NextResponse.json({ error: "Mission research is temporarily unavailable." }, { status: 502 });
    }

    const research = result.plan as MissionResearch;
    if (!startedExecutionId) {
      return NextResponse.json({ error: "The research execution boundary was not recorded." }, { status: 503 });
    }
    const completion = await supabase.rpc("complete_agent_execution", {
      p_execution_id: startedExecutionId,
      p_status: "SUCCEEDED",
      p_result: { summary: research.summary, source_count: research.sources.length },
      p_evidence: { verified: false, sources: research.sources },
    });
    if (completion.error) return NextResponse.json({ error: "Research completed but execution evidence could not be recorded." }, { status: 503 });

    const runId = crypto.randomUUID();
    let historyPersisted = false;
    if (repository.recordResearchRun) {
      try {
        await repository.recordResearchRun({
          missionId: mission.id,
          runId,
          requestId,
          summary: research.summary,
          sources: research.sources,
        });
        historyPersisted = true;
      } catch {
        historyPersisted = false;
      }
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
