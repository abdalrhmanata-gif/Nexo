import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/supabase/server";
import { DEFAULT_AI_MODEL } from "../../../../lib/ai-planner";

export const runtime = "nodejs";
export const maxDuration = 10;

export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
    }
  } catch {
    return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || DEFAULT_AI_MODEL;

  if (!apiKey) {
    return NextResponse.json({
      provider: "openai",
      configured: false,
      model,
      diagnosis: "OPENAI_API_KEY_MISSING",
    }, { status: 503 });
  }

  try {
    const response = await fetch(
      `https://api.openai.com/v1/models/${encodeURIComponent(model)}`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        cache: "no-store",
        signal: AbortSignal.timeout(8_000),
      },
    );

    if (response.ok) {
      return NextResponse.json({
        provider: "openai",
        configured: true,
        model,
        diagnosis: "OPENAI_AUTH_AND_MODEL_OK",
      }, { status: 200 });
    }

    if (response.status === 401) {
      return NextResponse.json({
        provider: "openai",
        configured: true,
        model,
        diagnosis: "OPENAI_API_KEY_REJECTED",
      }, { status: 502 });
    }

    if (response.status === 403) {
      return NextResponse.json({
        provider: "openai",
        configured: true,
        model,
        diagnosis: "OPENAI_MODEL_ACCESS_FORBIDDEN",
      }, { status: 502 });
    }

    if (response.status === 404) {
      return NextResponse.json({
        provider: "openai",
        configured: true,
        model,
        diagnosis: "OPENAI_MODEL_NOT_FOUND",
      }, { status: 502 });
    }

    if (response.status >= 500) {
      return NextResponse.json({
        provider: "openai",
        configured: true,
        model,
        diagnosis: "OPENAI_SERVICE_UNAVAILABLE",
      }, { status: 503 });
    }

    return NextResponse.json({
      provider: "openai",
      configured: true,
      model,
      diagnosis: "OPENAI_MODEL_CHECK_REJECTED",
      providerStatus: response.status,
    }, { status: 502 });
  } catch {
    return NextResponse.json({
      provider: "openai",
      configured: true,
      model,
      diagnosis: "OPENAI_CONNECTIVITY_UNKNOWN",
    }, { status: 504 });
  }
}
