import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GuideArticle, guideMetadata } from "../../../../components/guide-article";
import { GUIDE_LANGUAGES, guideBySlug, guideLocale, isGuideLanguage } from "../../../../lib/guides";

export const dynamicParams = false;

export function generateStaticParams() {
  return GUIDE_LANGUAGES.filter((lang) => lang !== "en").flatMap((lang) =>
    guideLocale(lang).guides.map((guide) => ({ lang, slug: guide.slug })));
}

export async function generateMetadata({ params }: { params: Promise<{ lang: string; slug: string }> }): Promise<Metadata> {
  const { lang, slug } = await params;
  return isGuideLanguage(lang) ? guideMetadata(slug, lang) : {};
}

export default async function LocalizedGuidePage({ params }: { params: Promise<{ lang: string; slug: string }> }) {
  const { lang, slug } = await params;
  if (!isGuideLanguage(lang) || lang === "en" || !guideBySlug(slug, lang)) notFound();
  return <GuideArticle slug={slug} lang={lang} />;
}
