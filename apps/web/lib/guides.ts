// Public, indexable guides for people starting a business in the United
// States. They exist to be found in search: each answers one question people
// type into Google, cites the official source for every fact that could go
// stale, and ends with a button that turns the guide into the reader's own
// Mission.
//
// Six languages, one URL each, so every version can rank on its own:
//   English   /guides/<slug>
//   others    /<lang>/guides/<slug>
// The interface dictionary (lib/i18n.ts) is not used here. A guide is long-
// form content with its own wording and sources; each language file holds the
// whole guide, its interface words included (see lib/guides/*.ts).
//
// Rules for anything added (checked by test/guides.test.mjs):
// - every language has the same guides, in the same order, with the same
//   number of steps and the same sources;
// - every source is an official https://*.gov page (lib/guides/sources.ts);
// - a dollar amount appears only in a step that cites its source.

import { SOURCE_URLS, type SourceKey } from "./guides/sources";
import { en } from "./guides/en";
import { es } from "./guides/es";
import { ar } from "./guides/ar";
import { fr } from "./guides/fr";
import { de } from "./guides/de";
import { nb } from "./guides/nb";

export type { SourceKey };

export const GUIDE_LANGUAGES = ["en", "es", "ar", "fr", "de", "nb"] as const;
export type GuideLanguage = (typeof GUIDE_LANGUAGES)[number];

export type GuideStep = { heading: string; body: string[]; source?: SourceKey };

export type Guide = {
  slug: string;
  /** The page's H1. */
  title: string;
  /** Short label for breadcrumbs and cards. */
  short: string;
  /** The search result title. Keep under about 60 characters. */
  metaTitle: string;
  /** The search result description. Keep under about 160 characters. */
  metaDescription: string;
  /** ISO date the facts were last checked against the sources. */
  updated: string;
  intro: string[];
  steps: GuideStep[];
  faqs: { question: string; answer: string }[];
  sources: SourceKey[];
  /** Pre-fills /app/missions/new, the same way a Mission template does. */
  mission: { name: string; intent: string; criteria: string[]; actions: string[] };
  related: string[];
};

/** Every word on a guide page that is not the guide itself. */
export type GuideChrome = {
  languageName: string;
  dir: "ltr" | "rtl";
  indexTitle: string;
  indexMetaTitle: string;
  indexMetaDescription: string;
  indexLead: string;
  guidesLabel: string;
  updated: string;
  minutes: (count: number) => string;
  stepsCount: (count: number) => string;
  officialSources: string;
  onThisPage: string;
  steps: string;
  faq: string;
  sources: string;
  related: string;
  officialSource: string;
  ctaTitle: string;
  ctaBody: string;
  ctaButton: string;
  ctaFree: string;
  readGuide: string;
  disclaimer: string;
  languages: string;
  sourceLabels: Record<SourceKey, string>;
};

export type GuideLocale = { chrome: GuideChrome; guides: Guide[] };

const LOCALES: Record<GuideLanguage, GuideLocale> = { en, es, ar, fr, de, nb };

export const SITE_URL = "https://zavqera.com";

export function isGuideLanguage(value: string): value is GuideLanguage {
  return (GUIDE_LANGUAGES as readonly string[]).includes(value);
}

export function guideLocale(lang: GuideLanguage) {
  return LOCALES[lang];
}

export function guideBySlug(slug: string, lang: GuideLanguage = "en") {
  return LOCALES[lang].guides.find((guide) => guide.slug === slug) ?? null;
}

/** Path of the guides index, or of one guide, in a language. */
export function guidePath(lang: GuideLanguage, slug?: string) {
  const base = lang === "en" ? "/guides" : `/${lang}/guides`;
  return slug ? `${base}/${slug}` : base;
}

/** hreflang alternates for a guide page or the index. */
export function guideAlternates(slug?: string) {
  const languages: Record<string, string> = {};
  for (const lang of GUIDE_LANGUAGES) languages[lang] = `${SITE_URL}${guidePath(lang, slug)}`;
  languages["x-default"] = `${SITE_URL}${guidePath("en", slug)}`;
  return languages;
}

export function sourceUrl(key: SourceKey) {
  return SOURCE_URLS[key];
}

export function readingMinutes(guide: Guide) {
  const text = [...guide.intro, ...guide.steps.flatMap((step) => [step.heading, ...step.body]), ...guide.faqs.flatMap((faq) => [faq.question, faq.answer])].join(" ");
  return Math.max(1, Math.round(text.split(/\s+/).length / 220));
}

/** Same query shape as a Mission template's "Use this template" link. */
export function guideMissionHref(guide: Guide) {
  const params = new URLSearchParams({
    name: guide.mission.name,
    intent: guide.mission.intent,
    criteria: guide.mission.criteria.join("\n"),
    actions: guide.mission.actions.join("\n"),
  });
  return `/app/missions/new?${params.toString()}`;
}
