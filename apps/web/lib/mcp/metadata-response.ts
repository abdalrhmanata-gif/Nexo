import { NextResponse, type NextRequest } from "next/server";
import { resolveRequestOrigin } from "../auth/redirect.mjs";
import { supabaseUrl } from "../supabase/config";
import { CORS_HEADERS, protectedResourceMetadata } from "./http.mjs";

/**
 * RFC 9728 protected resource metadata for <origin>/mcp: tells ChatGPT,
 * Claude and Gemini which authorization server signs people in. Served at
 * /.well-known/oauth-protected-resource and at …/mcp, the two places MCP
 * clients look.
 */
export function protectedResourceMetadataResponse(request: NextRequest) {
  if (!supabaseUrl) return NextResponse.json({ error: "Not available on this deployment." }, { status: 404, headers: CORS_HEADERS });
  const origin = resolveRequestOrigin(request.headers, request.url);
  return NextResponse.json(protectedResourceMetadata({ origin, supabaseUrl }), {
    headers: { ...CORS_HEADERS, "Cache-Control": "public, max-age=3600" },
  });
}
