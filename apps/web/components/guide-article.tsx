import type { Metadata } from "next";
import Link from "next/link";
import {
  GUIDE_COUNTRIES,
  GUIDE_LANGUAGES,
  SITE_URL,
  guideAlternates,
  guideBySlug,
  guideLocale,
  guidePath,
  readingMinutes,
  sourceUrl,
  type GuideLanguage,
} from "../lib/guides";
import { savePlan } from "../app/app/start/actions";

// Every visible word comes from the guide's own language file (lib/guides/*),
// not from the interface dictionary: see the header of lib/guides.ts.

/** JSON for a <script> tag: "<" escaped so content can never close the tag. */
function jsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function stepId(index: number) {
  return `step-${index + 1}`;
}

export function guideMetadata(slug: string, lang: GuideLanguage): Metadata {
  const guide = guideBySlug(slug, lang);
  if (!guide) return { title: "ZAVQERA" };
  const url = `${SITE_URL}${guidePath(lang, slug)}`;
  return {
    title: guide.metaTitle,
    description: guide.metaDescription,
    alternates: { canonical: url, languages: guideAlternates(slug) },
    openGraph: { title: guide.metaTitle, description: guide.metaDescription, url, type: "article", siteName: "ZAVQERA", locale: lang },
    twitter: { card: "summary", title: guide.metaTitle, description: guide.metaDescription },
  };
}

export function guidesIndexMetadata(lang: GuideLanguage): Metadata {
  const { chrome } = guideLocale(lang);
  return {
    title: chrome.indexMetaTitle,
    description: chrome.indexMetaDescription,
    alternates: { canonical: `${SITE_URL}${guidePath(lang)}`, languages: guideAlternates() },
  };
}

function LanguageSwitch({ lang, slug }: { lang: GuideLanguage; slug?: string }) {
  const { chrome } = guideLocale(lang);
  return (
    <nav className="guide-langs" aria-label={chrome.languages}>
      {GUIDE_LANGUAGES.map((code) => (
        <Link
          key={code}
          href={guidePath(code, slug)}
          hrefLang={code}
          lang={code}
          aria-current={code === lang ? "page" : undefined}
          className={code === lang ? "is-current" : undefined}
        >
          {guideLocale(code).chrome.languageName}
        </Link>
      ))}
    </nav>
  );
}

/** Each guide is about one country's rules. Said up front, in the reader's
    language, because a reader elsewhere would otherwise follow rules that are
    not theirs. */
function CountryNotice({ text }: { text: string }) {
  return <p className="guide-us-notice" role="note"><span aria-hidden="true">i</span>{text}</p>;
}

export function GuideArticle({ slug, lang }: { slug: string; lang: GuideLanguage }) {
  const { chrome } = guideLocale(lang);
  const guide = guideBySlug(slug, lang);
  if (!guide) return null;
  const url = `${SITE_URL}${guidePath(lang, slug)}`;
  const minutes = readingMinutes(guide);
  const related = guide.related
    .map((item) => guideBySlug(item, lang))
    .filter((item): item is NonNullable<typeof item> => item !== null);

  const structured = [
    {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: guide.title,
      description: guide.metaDescription,
      inLanguage: lang,
      dateModified: guide.updated,
      mainEntityOfPage: url,
      author: { "@type": "Organization", name: "ZAVQERA", url: SITE_URL },
      publisher: { "@type": "Organization", name: "ZAVQERA", url: SITE_URL },
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      inLanguage: lang,
      mainEntity: guide.faqs.map((faq) => ({ "@type": "Question", name: faq.question, acceptedAnswer: { "@type": "Answer", text: faq.answer } })),
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: chrome.guidesLabel, item: `${SITE_URL}${guidePath(lang)}` },
        { "@type": "ListItem", position: 2, name: guide.short, item: url },
      ],
    },
  ];

  const cta = (
    <div className="guide-cta">
      <strong className="guide-cta-title">{chrome.ctaTitle}</strong>
      <p>{chrome.ctaBody}</p>
      {/* Saves the guide's plan in one press. Without an account the press
          goes through sign-up, and the plan is saved straight after it. */}
      <form action={savePlan}>
        <input type="hidden" name="guide" value={guide.slug} />
        <input type="hidden" name="lang" value={lang} />
        <button className="button guide-cta-button" type="submit">{chrome.ctaButton} <span aria-hidden="true">{chrome.dir === "rtl" ? "←" : "→"}</span></button>
      </form>
      <small>{chrome.ctaFree}</small>
    </div>
  );

  return (
    <div className="guide-page" lang={lang} dir={chrome.dir}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(structured) }} />

      <header className="guide-header">
        <nav className="guide-crumbs" aria-label={chrome.guidesLabel}>
          <Link href={guidePath(lang)}>{chrome.guidesLabel}</Link>
          <span aria-hidden="true">/</span>
          <span>{guide.short}</span>
        </nav>
        <h1 className="guide-title">{guide.title}</h1>
        <CountryNotice text={chrome.countryNotice[guide.country]} />
        {guide.intro.map((paragraph) => <p className="guide-lead" key={paragraph}>{paragraph}</p>)}
        <p className="guide-meta">
          <span>{chrome.updated} <time dateTime={guide.updated}>{guide.updated}</time></span>
          <span aria-hidden="true">·</span>
          <span>{chrome.minutes(minutes)}</span>
          <span aria-hidden="true">·</span>
          <span>{chrome.stepsCount(guide.steps.length)}</span>
          <span aria-hidden="true">·</span>
          <span>{chrome.officialSources}</span>
        </p>
        <LanguageSwitch lang={lang} slug={slug} />
      </header>

      <div className="guide-layout">
        <article className="guide-body">
          <div className="guide-cta-inline">{cta}</div>

          <h2 id="steps">{chrome.steps}</h2>
          <ol className="guide-steps">
            {guide.steps.map((step, index) => (
              <li className="guide-step" id={stepId(index)} key={step.heading}>
                <span className="guide-step-number" aria-hidden="true">{index + 1}</span>
                <div>
                  <h3>{step.heading}</h3>
                  {step.body.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                  {step.source ? (
                    <a className="guide-source" href={sourceUrl(step.source)} rel="noopener" target="_blank">
                      {chrome.officialSource}: {chrome.sourceLabels[step.source]} <span aria-hidden="true">↗</span>
                    </a>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>

          <h2 id="faq">{chrome.faq}</h2>
          <div className="guide-faq">
            {guide.faqs.map((faq) => (
              <details key={faq.question}>
                <summary>{faq.question}</summary>
                <p>{faq.answer}</p>
              </details>
            ))}
          </div>

          <h2 id="sources">{chrome.sources}</h2>
          <ul className="guide-sources">
            {guide.sources.map((key) => (
              <li key={key}><a href={sourceUrl(key)} rel="noopener" target="_blank">{chrome.sourceLabels[key]} <span aria-hidden="true">↗</span></a></li>
            ))}
          </ul>
          <p className="guide-disclaimer">{chrome.disclaimer[guide.country]}</p>
        </article>

        <aside className="guide-aside">
          <nav className="guide-toc" aria-label={chrome.onThisPage}>
            <strong>{chrome.onThisPage}</strong>
            <ol>
              {guide.steps.map((step, index) => <li key={step.heading}><a href={`#${stepId(index)}`}>{step.heading}</a></li>)}
            </ol>
            <a href="#faq">{chrome.faq}</a>
          </nav>
          {cta}
        </aside>
      </div>

      {related.length ? (
        <section className="guide-related" aria-labelledby="related">
          <h2 id="related">{chrome.related}</h2>
          <div className="guide-cards">
            {related.map((item) => (
              <Link className="guide-card" key={item.slug} href={guidePath(lang, item.slug)}>
                <strong>{item.title}</strong>
                <span>{chrome.stepsCount(item.steps.length)} · {chrome.minutes(readingMinutes(item))}</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

export function GuidesIndex({ lang }: { lang: GuideLanguage }) {
  const { chrome, guides } = guideLocale(lang);
  let number = 0;
  return (
    <div className="guide-page" lang={lang} dir={chrome.dir}>
      <header className="guide-header guide-index-header">
        <h1 className="guide-title">{chrome.indexTitle}</h1>
        <p className="guide-lead">{chrome.indexLead}</p>
        <LanguageSwitch lang={lang} />
      </header>
      {GUIDE_COUNTRIES.map((country) => {
        const inCountry = guides.filter((guide) => guide.country === country);
        if (!inCountry.length) return null;
        return (
          <section className="guide-country" key={country} aria-labelledby={`guides-${country}`}>
            <h2 id={`guides-${country}`} className="guide-country-title">{chrome.countryHeading[country]}</h2>
            <CountryNotice text={chrome.countryNotice[country]} />
            <div className="guide-cards guide-index-cards">
              {inCountry.map((guide) => {
                number += 1;
                return (
                  <Link className="guide-card" key={guide.slug} href={guidePath(lang, guide.slug)}>
                    <span className="guide-card-index" aria-hidden="true">{String(number).padStart(2, "0")}</span>
                    <strong>{guide.title}</strong>
                    <p>{guide.metaDescription}</p>
                    <span>{chrome.stepsCount(guide.steps.length)} · {chrome.minutes(readingMinutes(guide))}</span>
                    <span className="guide-card-more">{chrome.readGuide} <span aria-hidden="true">{chrome.dir === "rtl" ? "←" : "→"}</span></span>
                  </Link>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
