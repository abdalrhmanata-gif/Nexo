import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdminClient } from "../../../../../lib/supabase/admin";
import {
  dispatchThroughJitClaim,
  reconcileThroughTrustedClaim,
  PERSISTENT_DISPATCH_DECISIONS,
} from "../../../../../lib/mission-authority/persistent-dispatch-gateway.mjs";
import { resolveTrustedDispatchAdapter } from "../../../../../lib/mission-authority/provider-adapter-registry.mjs";
import { isTrustedExecutionWorkerRequest } from "../../../../../lib/mission-authority/worker-auth.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };
const TOKEN_PATTERN = /^[A-Za-z0-9._~-]{32,512}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_INTERNAL_BODY_BYTES = 160_000;
const RESEARCH_COMPLETION_STATUSES = new Set(["SUCCEEDED", "FAILED", "UNKNOWN"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ executionId: string }> },
) {
  const expectedToken = process.env.ZAVQERA_EXECUTION_WORKER_TOKEN;
  if (!expectedToken || !TOKEN_PATTERN.test(expectedToken)) {
    return NextResponse.json({ error: "Trusted execution worker is not configured." }, { status: 503, headers: NO_STORE });
  }
  if (!isTrustedExecutionWorkerRequest(request.headers.get("authorization"), expectedToken)) {
    return NextResponse.json({ error: "Trusted worker authorization required." }, { status: 401, headers: NO_STORE });
  }

  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_INTERNAL_BODY_BYTES) {
    return NextResponse.json({ error: "Worker request is too large." }, { status: 413, headers: NO_STORE });
  }

  let body: unknown;
  try {
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_INTERNAL_BODY_BYTES) {
      return NextResponse.json({ error: "Worker request is too large." }, { status: 413, headers: NO_STORE });
    }
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "A valid worker operation is required." }, { status: 400, headers: NO_STORE });
  }
  if (!isRecord(body)) {
    return NextResponse.json({ error: "A worker operation is required." }, { status: 400, headers: NO_STORE });
  }
  const workerBody = body as Record<string, unknown>;
  const bodyKeys = Object.keys(workerBody);

  if (workerBody.operation === "complete_read_only_research") {
    const permittedKeys = new Set(["operation", "requestedBy", "status", "result", "evidence"]);
    if (bodyKeys.length !== permittedKeys.size
        || bodyKeys.some((key) => !permittedKeys.has(key))
        || typeof workerBody.requestedBy !== "string"
        || !UUID_PATTERN.test(workerBody.requestedBy)
        || typeof workerBody.status !== "string"
        || !RESEARCH_COMPLETION_STATUSES.has(workerBody.status)
        || !isRecord(workerBody.result)
        || !isRecord(workerBody.evidence)
        || new TextEncoder().encode(JSON.stringify(workerBody.result)).byteLength > 50_000
        || new TextEncoder().encode(JSON.stringify(workerBody.evidence)).byteLength > 98_304) {
      return NextResponse.json({ error: "A bounded, requester-bound research completion is required." }, { status: 400, headers: NO_STORE });
    }

    const { executionId } = await params;
    if (!UUID_PATTERN.test(executionId)) {
      return NextResponse.json({ error: "A valid execution id is required." }, { status: 400, headers: NO_STORE });
    }

    try {
      const client = createSupabaseAdminClient();
      const completion = await client.rpc("complete_read_only_research_execution", {
        p_requested_by: workerBody.requestedBy,
        p_execution_id: executionId,
        p_status: workerBody.status,
        p_result: workerBody.result,
        p_evidence: workerBody.evidence,
        p_error_code: null,
        p_error_message: null,
      });
      if (completion.error || !isRecord(completion.data)
          || completion.data.id !== executionId
          || completion.data.status !== workerBody.status) {
        return NextResponse.json({ error: "Trusted research completion was rejected or could not be confirmed." }, { status: 409, headers: NO_STORE });
      }
      return NextResponse.json({
        execution: {
          id: completion.data.id,
          status: completion.data.status,
          completed_at: completion.data.completed_at,
        },
      }, { headers: NO_STORE });
    } catch {
      return NextResponse.json({ error: "Trusted research completion could not be confirmed." }, { status: 503, headers: NO_STORE });
    }
  }

  if (bodyKeys.some((key) => key !== "operation" && key !== "audience")
      || (workerBody.operation !== "dispatch" && workerBody.operation !== "reconcile")
      || typeof workerBody.audience !== "string"
      || !workerBody.audience.trim()
      || workerBody.audience.length > 128) {
    return NextResponse.json({ error: "Only a valid operation and provider audience are accepted." }, { status: 400, headers: NO_STORE });
  }

  const { executionId } = await params;
  if (!UUID_PATTERN.test(executionId)) {
    return NextResponse.json({ error: "A valid execution id is required." }, { status: 400, headers: NO_STORE });
  }

  const adapter = resolveTrustedDispatchAdapter(workerBody.audience);
  if (!adapter) {
    // Fail closed before constructing a privileged client or claiming an execution.
    return NextResponse.json({ error: "No reviewed provider adapter is registered. No provider call occurred." }, { status: 503, headers: NO_STORE });
  }
  if (workerBody.operation === "reconcile" && typeof adapter.reconcile !== "function") {
    return NextResponse.json({ error: "The registered provider adapter has no reviewed reconciliation implementation." }, { status: 503, headers: NO_STORE });
  }

  try {
    const client = createSupabaseAdminClient();
    const result = workerBody.operation === "dispatch"
      ? await dispatchThroughJitClaim({ client, adapter, executionId })
      : await reconcileThroughTrustedClaim({ client, adapter, executionId });
    const status = result.decision === PERSISTENT_DISPATCH_DECISIONS.DISPATCHED
      || result.decision === PERSISTENT_DISPATCH_DECISIONS.RECONCILED
      ? 200
      : result.decision === PERSISTENT_DISPATCH_DECISIONS.DENY ? 409 : 202;
    return NextResponse.json(result, { status, headers: NO_STORE });
  } catch {
    return NextResponse.json({ error: "Trusted worker operation could not be completed. Inspect the execution record before retrying." }, { status: 503, headers: NO_STORE });
  }
}
