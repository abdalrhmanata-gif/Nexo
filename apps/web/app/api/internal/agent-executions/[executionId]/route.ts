import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdminClient } from "../../../../../lib/supabase/admin";
import {
  dispatchThroughJitClaim,
  reconcileThroughTrustedClaim,
} from "../../../../../lib/mission-authority/persistent-dispatch-gateway.mjs";
import { resolveTrustedDispatchAdapter } from "../../../../../lib/mission-authority/provider-adapter-registry.mjs";
import {
  createMissionActionWorkerOperationHandler,
  parseTrustedWorkerRequest,
} from "../../../../../lib/mission-authority/trusted-worker-http.mjs";
import {
  isResearchCompletionSchemaProbeError,
  isResearchClaimSchemaProbeError,
  RESEARCH_CLAIM_SCHEMA_PROBE_UUID,
  RESEARCH_COMPLETION_SCHEMA_PROBE_UUID,
} from "../../../../../lib/mission-authority/research-completion-schema-preflight.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RESEARCH_COMPLETION_STATUSES = new Set(["SUCCEEDED", "FAILED", "UNKNOWN"]);
const RESEARCH_CLAIM_ERROR_CODES = new Set([
  "TRUSTED_EXECUTOR_REQUIRED",
  "INVALID_RESEARCH_CLAIM_BINDING",
  "EXECUTION_NOT_FOUND_OR_FORBIDDEN",
  "MISSION_CLOSED_OR_NOT_FOUND",
  "RESEARCH_AGENT_AUTHORITY_CHANGED",
  "READ_ONLY_RESEARCH_EXECUTION_REQUIRED",
  "RESEARCH_EXECUTION_ALREADY_CLAIMED",
  "EXECUTION_LEASE_EXPIRED",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

const handleMissionActionWorkerOperation = createMissionActionWorkerOperationHandler({
  resolveAdapter: resolveTrustedDispatchAdapter,
  createClient: createSupabaseAdminClient,
  dispatch: dispatchThroughJitClaim,
  reconcile: reconcileThroughTrustedClaim,
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ executionId: string }> },
) {
  const parsedRequest = await parseTrustedWorkerRequest(
    request,
    process.env.ZAVQERA_EXECUTION_WORKER_TOKEN,
  );
  if (!parsedRequest.ok) {
    return NextResponse.json(parsedRequest.body, {
      status: parsedRequest.status,
      headers: NO_STORE,
    });
  }
  const workerBody = parsedRequest.body as Record<string, unknown>;
  const bodyKeys = Object.keys(workerBody);

  if (workerBody.operation === "preflight_read_only_research") {
    const permittedKeys = new Set(["operation", "requestedBy"]);
    if (bodyKeys.length !== permittedKeys.size
        || bodyKeys.some((key) => !permittedKeys.has(key))
        || typeof workerBody.requestedBy !== "string"
        || !UUID_PATTERN.test(workerBody.requestedBy)) {
      return NextResponse.json({ error: "A requester-bound schema preflight is required." }, { status: 400, headers: NO_STORE });
    }

    try {
      const client = createSupabaseAdminClient();
      // This deliberately malformed UUID can only produce 22P02 if PostgREST
      // resolved the expected RPC signature and attempted UUID coercion. It
      // cannot select or mutate an execution row.
      const probe = await client.rpc("complete_read_only_research_execution", {
        p_requested_by: workerBody.requestedBy,
        p_execution_id: RESEARCH_COMPLETION_SCHEMA_PROBE_UUID,
        p_status: "FAILED",
        p_result: { reason: "SCHEMA_PREFLIGHT" },
        p_evidence: {
          outcome: "FAILED",
          verified: false,
          request_id: "schema-preflight",
        },
        p_error_code: null,
        p_error_message: null,
      });
      if (isResearchCompletionSchemaProbeError(probe.error)) {
        const claimProbe = await client.rpc("claim_read_only_research_execution", {
          p_requested_by: workerBody.requestedBy,
          p_execution_id: RESEARCH_CLAIM_SCHEMA_PROBE_UUID,
          p_request_id: "schema-preflight-read-only-research",
        });
        if (isResearchClaimSchemaProbeError(claimProbe.error)) {
          return NextResponse.json({ ready: true }, { headers: NO_STORE });
        }
      }
      return NextResponse.json(
        { ready: false, error: "Trusted research completion schema is unavailable or unverified." },
        { status: 503, headers: NO_STORE },
      );
    } catch {
      return NextResponse.json(
        { ready: false, error: "Trusted research completion schema could not be confirmed." },
        { status: 503, headers: NO_STORE },
      );
    }
  }

  if (workerBody.operation === "claim_read_only_research") {
    const permittedKeys = new Set(["operation", "requestedBy", "requestId"]);
    if (bodyKeys.length !== permittedKeys.size
        || bodyKeys.some((key) => !permittedKeys.has(key))
        || typeof workerBody.requestedBy !== "string"
        || !UUID_PATTERN.test(workerBody.requestedBy)
        || typeof workerBody.requestId !== "string"
        || workerBody.requestId.trim().length < 16
        || workerBody.requestId.length > 200) {
      return NextResponse.json({ error: "A requester-bound research claim is required." }, { status: 400, headers: NO_STORE });
    }

    const { executionId } = await params;
    if (!UUID_PATTERN.test(executionId)) {
      return NextResponse.json({ error: "A valid execution id is required." }, { status: 400, headers: NO_STORE });
    }

    try {
      const client = createSupabaseAdminClient();
      const claim = await client.rpc("claim_read_only_research_execution", {
        p_requested_by: workerBody.requestedBy,
        p_execution_id: executionId,
        p_request_id: workerBody.requestId,
      });
      if (claim.error || !isRecord(claim.data)
          || claim.data.execution_id !== executionId
          || claim.data.requested_by !== workerBody.requestedBy
          || claim.data.request_id !== workerBody.requestId
          || typeof claim.data.mission_objective !== "string"
          || typeof claim.data.mission_version !== "number"
          || !Number.isSafeInteger(claim.data.mission_version)
          || typeof claim.data.request_hash !== "string"
          || !/^[0-9a-f]{64}$/.test(claim.data.request_hash)
          || typeof claim.data.authority_hash !== "string"
          || !/^[0-9a-f]{64}$/.test(claim.data.authority_hash)
          || typeof claim.data.claimed_at !== "string") {
        const errorCode = claim.error && RESEARCH_CLAIM_ERROR_CODES.has(claim.error.message)
          ? claim.error.message
          : "RESEARCH_CLAIM_RESPONSE_UNCONFIRMED";
        return NextResponse.json({
          error: "The read-only research JIT claim was denied or could not be confirmed.",
          errorCode,
        }, {
          status: claim.error ? (claim.error.code === "42501" || claim.error.code === "22023" ? 409 : 503) : 503,
          headers: NO_STORE,
        });
      }
      return NextResponse.json({ claim: claim.data }, { headers: NO_STORE });
    } catch {
      return NextResponse.json({ error: "The read-only research JIT claim could not be confirmed." }, { status: 503, headers: NO_STORE });
    }
  }

  if (workerBody.operation === "complete_read_only_research") {
    const permittedKeys = new Set(["operation", "requestedBy", "status", "result", "evidence", "errorCode", "errorMessage"]);
    if (bodyKeys.length !== permittedKeys.size
        || bodyKeys.some((key) => !permittedKeys.has(key))
        || typeof workerBody.requestedBy !== "string"
        || !UUID_PATTERN.test(workerBody.requestedBy)
        || typeof workerBody.status !== "string"
        || !RESEARCH_COMPLETION_STATUSES.has(workerBody.status)
        || !isRecord(workerBody.result)
        || !isRecord(workerBody.evidence)
        || (workerBody.errorCode !== undefined && workerBody.errorCode !== null
          && (typeof workerBody.errorCode !== "string" || workerBody.errorCode.length > 128))
        || (workerBody.errorMessage !== undefined && workerBody.errorMessage !== null
          && (typeof workerBody.errorMessage !== "string" || workerBody.errorMessage.length > 1000))
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
        p_error_code: typeof workerBody.errorCode === "string" ? workerBody.errorCode : null,
        p_error_message: typeof workerBody.errorMessage === "string" ? workerBody.errorMessage : null,
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

  const { executionId } = await params;
  const result = await handleMissionActionWorkerOperation({ workerBody, executionId });
  return NextResponse.json(result.body, {
    status: result.status,
    headers: NO_STORE,
  });
}
