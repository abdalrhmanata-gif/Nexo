import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ChecklistsIndex, checklistsIndexMetadata } from "../../../components/checklist-article";
import { CHECKLIST_LANGUAGES } from "../../../lib/checklists.mjs";

// Checklists written in another language. English lives at /checklists.
export const dynamicParams = false;

const OTHER_LANGUAGES: readonly string[] = CHECKLIST_LANGUAGES.filter((lang) => lang !== "en");

export function generateStaticParams() {
  return OTHER_LANGUAGES.map((lang) => ({ lang }));
}

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return OTHER_LANGUAGES.includes(lang) ? checklistsIndexMetadata(lang) : {};
}

export default async function LocalizedChecklistsPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!OTHER_LANGUAGES.includes(lang)) notFound();
  return <ChecklistsIndex lang={lang} />;
}
