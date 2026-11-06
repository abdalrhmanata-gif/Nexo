import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "../../../lib/supabase/config";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

export const dynamic = "force-dynamic";

const PLANS = ["Plus", "Pro"];

// Recording that someone wants a plan that does not exist yet.
//
// The answer is the same whether the address was new, already on the list, or
// rejected as malformed. An endpoint that distinguishes those is an endpoint
// that tells a stranger whether a given person is a customer.
const OK = () => new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) return OK();

  let body: { email?: unknown; plan?: unknown; locale?: unknown; consent?: unknown };
  try {
    body = await request.json();
  } catch {
    return OK();
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  const plan = typeof body.plan === "string" ? body.plan.trim() : "";
  // Validated again in the database function; this is the cheap rejection, not
  // the authoritative one.
  if (!email.includes("@") || email.length > 254 || !PLANS.includes(plan)) return OK();

  try {
    const supabase = await createSupabaseServerClient();
    await supabase.rpc("record_plan_interest", {
      p_email: email,
      p_plan: plan,
      p_locale: typeof body.locale === "string" ? body.locale.slice(0, 8) : null,
      p_consent_text: typeof body.consent === "string" ? body.consent.slice(0, 500) : "",
    });
  } catch {
    // Swallowed on purpose: the same answer in every case.
  }
  return OK();
}
