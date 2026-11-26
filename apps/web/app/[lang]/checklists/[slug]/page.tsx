import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ChecklistArticle, checklistMetadata } from "../../../../components/checklist-article";
import { CHECKLIST_LANGUAGES, checklistBySlug, checklistLanguage, checklistsIn } from "../../../../lib/checklists.mjs";

// A checklist written in another language, at /<lang>/checklists/<slug>.
// A slug is served only under its own language.
export const dynamicParams = false;

export function generateStaticParams() {
  return CHECKLIST_LANGUAGES.filter((lang) => lang !== "en").flatMap((lang) => checklistsIn(lang).map((checklist) => ({ lang, slug: checklist.slug })));
}

type Params = Promise<{ lang: string; slug: string }>;

function found(lang: string, slug: string) {
  const checklist = checklistBySlug(slug);
  return checklist && lang !== "en" && checklistLanguage(checklist) === lang ? checklist : null;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { lang, slug } = await params;
  return found(lang, slug) ? checklistMetadata(slug) : {};
}

export default async function LocalizedChecklistPage({ params }: { params: Params }) {
  const { lang, slug } = await params;
  if (!found(lang, slug)) notFound();
  return <ChecklistArticle slug={slug} />;
}
