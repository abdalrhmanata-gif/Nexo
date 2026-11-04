import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const developmentProjectHost = "mrwmmbytcymqgwvcoywd.supabase.co";

function hostOf(value: string | undefined) {
  if (!value) return null;
  try {
    return new URL(value).host;
  } catch {
    return null;
  }
}

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;

  return NextResponse.json({
    application: "reachable",
    runtime: "server",
    supabase: {
      urlConfigured: Boolean(url),
      publishableKeyConfigured: Boolean(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY),
      targetsDevelopmentProject: hostOf(url) === developmentProjectHost,
    },
  }, { headers: { "cache-control": "no-store" } });
}
