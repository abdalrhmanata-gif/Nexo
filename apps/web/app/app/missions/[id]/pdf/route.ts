import { NextResponse, type NextRequest } from "next/server";
import { resolveRequestOrigin } from "../../../../../lib/auth/redirect.mjs";
import { getLanguage, getTranslate } from "../../../../../lib/i18n-server";
import { missionPdfFileName, missionPdfModel } from "../../../../../lib/mission-pdf.mjs";
import { renderPdf } from "../../../../../lib/pdf-document.mjs";
import { pdfFonts } from "../../../../../lib/pdf-fonts";
import { createSupabaseMissionRepository } from "../../../../../lib/supabase/mission-repository";
import { readMissionDates } from "../../../../../lib/supabase/plan-dates-repository";
import { getAuthenticatedUser } from "../../../../../lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * "Download PDF" on a checklist's page: a real file, made on the server for
 * someone who can open the checklist. It replaces the browser's print
 * window, which does nothing inside the in-app browsers of iPhone apps.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const origin = resolveRequestOrigin(request.headers, request.url);
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.redirect(new URL("/app", origin));
  if (!(await getAuthenticatedUser())) {
    const signIn = new URL("/auth/sign-in", origin);
    signIn.searchParams.set("next", `/app/missions/${id}`);
    return NextResponse.redirect(signIn);
  }
  const mission = await (await createSupabaseMissionRepository()).getMission(id);
  if (!mission) return NextResponse.redirect(new URL("/app", origin));
  const [dates, t, lang] = await Promise.all([readMissionDates(mission.id), getTranslate(), getLanguage()]);
  const model = missionPdfModel(mission, dates, { t, lang, rtl: lang === "ar", madeOn: new Date().toISOString().slice(0, 10) });
  const bytes = await renderPdf(model, await pdfFonts(origin));
  return new Response(bytes as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${missionPdfFileName(mission.name, mission.id)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
