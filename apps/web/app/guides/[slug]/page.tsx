import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GuideArticle, guideMetadata } from "../../../components/guide-article";
import { guideBySlug, guideLocale } from "../../../lib/guides";

export const dynamicParams = false;

export function generateStaticParams() {
  return guideLocale("en").guides.map((guide) => ({ slug: guide.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  return guideMetadata((await params).slug, "en");
}

export default async function GuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!guideBySlug(slug, "en")) notFound();
  return <GuideArticle slug={slug} lang="en" />;
}
