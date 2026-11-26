import { checklistPdfFileName, checklistPdfModel } from "../../../../lib/checklist-pdf.mjs";
import { checklists } from "../../../../lib/checklists.mjs";
import { renderPdf } from "../../../../lib/pdf-document.mjs";
import { pdfFonts } from "../../../../lib/pdf-fonts";

// A ready-made checklist as a PDF file, made once at build time.
export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return checklists.map((checklist) => ({ slug: checklist.slug }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const model = checklistPdfModel(slug);
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
