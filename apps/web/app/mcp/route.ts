import { NextResponse, type NextRequest } from "next/server";
import { resolveRequestOrigin } from "../../lib/auth/redirect.mjs";
import { supabasePublishableKey, supabaseUrl } from "../../lib/supabase/config";
import { todayIn } from "../../lib/plan-dates.mjs";
import { handleMcpPayload, parseErrorResponse } from "../../lib/mcp/protocol.mjs";
import { callTool, toolDescriptors } from "../../lib/mcp/tools.mjs";
import { authChallenge, bearerToken, CORS_HEADERS } from "../../lib/mcp/http.mjs";
import { clientForToken, createMcpApi, userForToken } from "../../lib/mcp/data";

// ZAVQERA's MCP server for ChatGPT, Claude and Gemini: Streamable HTTP,
// stateless, one JSON answer per POST. Every request must carry the person's
// OAuth access token; without one the answer is a 401 that tells the
// assistant where to sign the person in.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BASE_HEADERS = { ...CORS_HEADERS, "Cache-Control": "no-store" };

function unauthorized(origin: string, error?: string) {
  return NextResponse.json(
    { error: error ? "invalid_token" : "unauthorized", error_description: error ?? "Sign in to ZAVQERA to use these tools." },
    { status: 401, headers: { ...BASE_HEADERS, "WWW-Authenticate": authChallenge(origin, error) } },
  );
}

export async function POST(request: NextRequest) {
  const origin = resolveRequestOrigin(request.headers, request.url);
  if (!supabaseUrl || !supabasePublishableKey) {
    return NextResponse.json({ error: "ZAVQERA's assistant connection is not available on this deployment." }, { status: 503, headers: BASE_HEADERS });
  }

  const token = bearerToken(request.headers.get("authorization"));
  if (!token) return unauthorized(origin);
  const client = clientForToken(token);
  const user = await userForToken(client, token);
  if (user === "unavailable") {
    // Supabase Auth could not answer: ask the assistant to retry, not to reconnect.
    return NextResponse.json(
      { error: "temporarily_unavailable", error_description: "ZAVQERA could not check the connection just now. Try again in a moment." },
      { status: 503, headers: { ...BASE_HEADERS, "Retry-After": "5" } },
    );
  }
  if (!user) return unauthorized(origin, "The access token is missing, expired or revoked. Connect ZAVQERA again.");

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(parseErrorResponse(), { status: 400, headers: BASE_HEADERS });
  }

  const today = todayIn("UTC");
  const api = createMcpApi(client, user.id, origin);
  const answer = await handleMcpPayload(payload, {
    listTools: toolDescriptors,
    callTool: (name, args) => callTool(name, args, { api, origin, today }),
  });
  if (answer === null) return new NextResponse(null, { status: 202, headers: BASE_HEADERS });
  return NextResponse.json(answer, { status: 200, headers: BASE_HEADERS });
}

/** No server-sent stream: every answer comes back on its POST. */
export function GET() {
  return NextResponse.json({ error: "Send MCP messages with POST." }, { status: 405, headers: { ...BASE_HEADERS, Allow: "POST, OPTIONS" } });
}

/** Stateless: there is no session to end. */
export function DELETE() {
  return NextResponse.json({ error: "This server keeps no sessions." }, { status: 405, headers: { ...BASE_HEADERS, Allow: "POST, OPTIONS" } });
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: BASE_HEADERS });
}
