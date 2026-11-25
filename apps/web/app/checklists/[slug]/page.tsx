import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ChecklistArticle, checklistMetadata } from "../../../components/checklist-article";
import { checklistBySlug, checklists } from "../../../lib/checklists.mjs";

export const dynamicParams = false;

export function generateStaticParams() {
  return checklists.map((checklist) => ({ slug: checklist.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  return checklistMetadata((await params).slug);
}

export default async function ChecklistPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!checklistBySlug(slug)) notFound();
  return <ChecklistArticle slug={slug} />;
}
