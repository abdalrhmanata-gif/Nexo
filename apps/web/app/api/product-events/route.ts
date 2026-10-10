import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { isSupabaseConfigured } from "../../../lib/supabase/config";
import { missionTemplateById } from "../../../lib/mission-templates";
import { createProductEventHandler } from "../../../lib/product-events.mjs";

export const dynamic = "force-dynamic";

export const POST = createProductEventHandler({
  isSupabaseConfigured,
  createSupabaseServerClient,
  isValidTemplateId: (templateId) => Boolean(missionTemplateById(templateId)),
  jsonResponse: (body, init) => NextResponse.json(body, init),
});
