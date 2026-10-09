import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";

type Action = "REQUEST_CANCELLATION" | "RECONCILE" | "RETRY";

function publicError(message: string, code?: string) {
  if (code === "42501") return { status: 403, error: "You do not have permission to change this execution." };
  if (message.includes("EXECUTION_LEASE_NOT_EXPIRED")) return { status: 409, error: "This execution lease has not expired. Refresh its status and try again later." };
  if (message.includes("EXECUTION_OUTCOME_UNKNOWN_NOT_RETRYABLE")) return { status: 409, error: "The outcome is unknown. Verify the external result before attempting new work." };
  if (message.includes("EXECUTION_RETRY_ALREADY_CREATED")) return { status: 409, error: "A retry already exists for this attempt. Refresh the execution history." };
  if (message.includes("EXECUTION_STATUS_NOT_RETRYABLE")) return { status: 409, error: "Only a confirmed FAILED or BLOCKED attempt can be retried." };
  if (message.includes("AGENT_AUTHORITY_CHANGED")) return { status: 409, error: "Agent authority changed. Review the current authority before retrying." };
  if (message.includes("APPROVAL_REQUIRED")) return { status: 403, error: "Current approval is missing or no longer valid." };
  if (message.includes("EXECUTION_NOT_RUNNING")) return { status: 409, error: "This execution is no longer running." };
  if (message.includes("EXECUTION_IDEMPOTENCY_BINDING_MISMATCH")) return { status: 409, error: "The retry key is already bound to another execution." };
  if (message.includes("INVALID_EXECUTION_IDEMPOTENCY_KEY")) return { status: 400, error: "The retry request key is invalid." };
  if (message.includes("MISSION_CLOSED")) return { status: 409, error: "This mission is closed and cannot be retried." };
  return { status: 400, error: "The execution action could not be recorded. Refresh and inspect the execution history." };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ executionId: string }> },
) {
  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "A valid execution action is required." }, { status: 400 });
  }

  const action = body.action as Action;
  if (!["REQUEST_CANCELLATION", "RECONCILE", "RETRY"].includes(action)) {
    return NextResponse.json({ error: "Invalid execution action." }, { status: 400 });
  }
  const idempotencyKey = typeof body.idempotencyKey === "string" ? body.idempotencyKey : "";
  if (action === "RETRY" && (idempotencyKey.length < 16 || idempotencyKey.length > 200)) {
    return NextResponse.json({ error: "A valid retry request key is required." }, { status: 400 });
  }

  try {
    const { data: { user }, error: authError } = await (await createSupabaseServerClient()).auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const { executionId } = await params;
    const supabase = await createSupabaseServerClient();
    const functionName = action === "REQUEST_CANCELLATION"
      ? "request_agent_execution_cancellation"
      : action === "RECONCILE"
        ? "reconcile_stale_agent_execution"
        : "retry_agent_execution";
    const args = action === "RETRY"
      ? { p_execution_id: executionId, p_new_idempotency_key: idempotencyKey }
      : { p_execution_id: executionId };
    const result = await supabase.rpc(functionName, args);
    if (result.error) {
      const mapped = publicError(result.error.message ?? "", result.error.code);
      return NextResponse.json({ error: mapped.error }, { status: mapped.status });
    }
    return NextResponse.json({ execution: result.data }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "The execution service could not complete this action." }, { status: 503 });
  }
}
