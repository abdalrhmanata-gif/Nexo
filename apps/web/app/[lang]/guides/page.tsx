import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GuidesIndex, guidesIndexMetadata } from "../../../components/guide-article";
import { GUIDE_LANGUAGES, isGuideLanguage } from "../../../lib/guides";

// The translated guides. English lives at /guides, so it is not listed here.
export const dynamicParams = false;

export function generateStaticParams() {
  return GUIDE_LANGUAGES.filter((lang) => lang !== "en").map((lang) => ({ lang }));
}

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return isGuideLanguage(lang) ? guidesIndexMetadata(lang) : {};
}

export default async function LocalizedGuidesPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isGuideLanguage(lang) || lang === "en") notFound();
  return <GuidesIndex lang={lang} />;
}
