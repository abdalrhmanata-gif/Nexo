import { checklistPdfFileName, checklistPdfModel } from "../../../../../lib/checklist-pdf.mjs";
import { CHECKLIST_LANGUAGES, checklistBySlug, checklistLanguage, checklistsIn } from "../../../../../lib/checklists.mjs";
import { renderPdf } from "../../../../../lib/pdf-document.mjs";
import { pdfFonts } from "../../../../../lib/pdf-fonts";

// A ready-made checklist in another language, as a PDF file made at build time.
export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return CHECKLIST_LANGUAGES.filter((lang) => lang !== "en").flatMap((lang) => checklistsIn(lang).map((checklist) => ({ lang, slug: checklist.slug })));
}

export async function GET(_request: Request, { params }: { params: Promise<{ lang: string; slug: string }> }) {
  const { lang, slug } = await params;
  const checklist = checklistBySlug(slug);
  const model = checklist && checklistLanguage(checklist) === lang ? checklistPdfModel(slug) : null;
  if (!model) return new Response("Not found", { status: 404 });
  const bytes = await renderPdf(model, await pdfFonts());
  return new Response(bytes as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${checklistPdfFileName(slug)}"`,
      "Cache-Control": "public, max-age=3600",
    },
  });
}
