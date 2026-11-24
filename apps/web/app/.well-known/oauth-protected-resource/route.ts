import { NextResponse, type NextRequest } from "next/server";
import { CORS_HEADERS } from "../../../lib/mcp/http.mjs";
import { protectedResourceMetadataResponse } from "../../../lib/mcp/metadata-response";

export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  return protectedResourceMetadataResponse(request);
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}
