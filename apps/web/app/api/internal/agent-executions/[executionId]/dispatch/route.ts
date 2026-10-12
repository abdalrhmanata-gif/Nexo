import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdminClient } from "../../../../../../lib/supabase/admin";
import {
  dispatchThroughJitClaim,
  PERSISTENT_DISPATCH_DECISIONS,
} from "../../../../../../lib/mission-authority/persistent-dispatch-gateway.mjs";
import { resolveTrustedDispatchAdapter } from "../../../../../../lib/mission-authority/provider-adapter-registry.mjs";
import { isTrustedExecutionWorkerRequest } from "../../../../../../lib/mission-authority/worker-auth.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };
const TOKEN_PATTERN = /^[A-Za-z0-9._~-]{32,512}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "A provider audience is required." }, { status: 400, headers: NO_STORE });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)
      || typeof (body as { audience?: unknown }).audience !== "string"
      || !(body as { audience: string }).audience.trim()
      || (body as { audience: string }).audience.length > 128) {
    return NextResponse.json({ error: "A valid provider audience is required." }, { status: 400, headers: NO_STORE });
  }

  const adapter = resolveTrustedDispatchAdapter((body as { audience: string }).audience);
  if (!adapter) {
    // Fail closed before constructing a privileged client or claiming an execution.
    return NextResponse.json({ error: "No reviewed provider adapter is registered. No dispatch occurred." }, { status: 503, headers: NO_STORE });
  }

  const { executionId } = await params;
  if (!UUID_PATTERN.test(executionId)) {
    return NextResponse.json({ error: "A valid execution id is required." }, { status: 400, headers: NO_STORE });
  }

  try {
    const client = createSupabaseAdminClient();
    const result = await dispatchThroughJitClaim({ client, adapter, executionId });
    const status = result.decision === PERSISTENT_DISPATCH_DECISIONS.DISPATCHED
      ? 200
      : result.decision === PERSISTENT_DISPATCH_DECISIONS.DENY ? 409 : 202;
    return NextResponse.json(result, { status, headers: NO_STORE });
  } catch {
    return NextResponse.json({ error: "Trusted dispatch could not be completed. Inspect the execution record before any retry." }, { status: 503, headers: NO_STORE });
  }
}
