import type { Metadata } from "next";
import Link from "next/link";
import {
  CHECKLIST_GROUPS,
  checklistAlternates,
  checklistBySlug,
  checklistChrome,
  checklistLanguage,
  checklistMissionHref,
  checklistPath,
  checklistsIn,
} from "../lib/checklists.mjs";
import { SITE_URL } from "../lib/guides";
import { savePlan } from "../app/app/start/actions";
import { taskTrackerPath } from "../lib/task-tracker.mjs";
import { checklistPdfPath } from "../lib/checklist-pdf.mjs";

// Every visible word comes from the checklist data: lib/checklists.mjs in
// English, lib/checklists-ar.mjs in Arabic. A checklist carries its own
// language, so the page follows it. The layout reuses the guide styles.

/** JSON for a <script> tag: "<" escaped so content can never close the tag. */
function jsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function stepId(index: number) {
  return `step-${index + 1}`;
}

export function checklistMetadata(slug: string): Metadata {
  const checklist = checklistBySlug(slug);
  if (!checklist) return { title: "ZAVQERA" };
  const lang = checklistLanguage(checklist);
  const url = `${SITE_URL}${checklistPath(slug)}`;
  const alternates = checklistAlternates(checklist);
  return {
    title: checklist.metaTitle,
    description: checklist.metaDescription,
    alternates: {
      canonical: url,
      ...(alternates ? { languages: Object.fromEntries(Object.entries(alternates).map(([code, path]) => [code, `${SITE_URL}${path}`])) } : {}),
    },
    openGraph: { title: checklist.metaTitle, description: checklist.metaDescription, url, type: "article", siteName: "ZAVQERA", locale: lang },
    twitter: { card: "summary", title: checklist.metaTitle, description: checklist.metaDescription },
  };
}

export function checklistsIndexMetadata(lang = "en"): Metadata {
  const chrome = checklistChrome(lang);
  const url = `${SITE_URL}${checklistPath(undefined, lang)}`;
  return {
    title: chrome.indexMetaTitle,
    description: chrome.indexMetaDescription,
    alternates: { canonical: url },
    openGraph: { title: chrome.indexMetaTitle, description: chrome.indexMetaDescription, url, type: "website", siteName: "ZAVQERA", locale: lang },
  };
}

function SaveChecklist({ slug, compact = false }: { slug: string; compact?: boolean }) {
  const checklist = checklistBySlug(slug)!;
  const lang = checklistLanguage(checklist);
  const chrome = checklistChrome(lang);
  return (
    <div className="guide-cta">
      <strong className="guide-cta-title">{chrome.ctaTitle}</strong>
      {compact ? null : <p>{chrome.ctaBody}</p>}
      {/* Saves the checklist as a Mission in one press. Without an account the
          press goes through sign-up, and the plan is saved straight after it. */}
      <form action={savePlan}>
        <input type="hidden" name="checklist" value={checklist.slug} />
        <input type="hidden" name="lang" value={lang} />
        <button className="button guide-cta-button" type="submit">{chrome.ctaButton} <span aria-hidden="true">{chrome.dir === "rtl" ? "←" : "→"}</span></button>
      </form>
      <Link className="checklist-edit-link" href={checklistMissionHref(checklist)} prefetch={false}>{chrome.ctaEdit}</Link>
      <small>{chrome.ctaFree}</small>
      {/* The same checklist as a file, for teams that print it. A plain link:
          a real file opens on every phone, unlike the print window. */}
      <a className="checklist-pdf-link" href={checklistPdfPath(checklist.slug)} download>{chrome.pdfButton}</a>
      <small>{chrome.pdfNote}</small>
    </div>
  );
}

export function ChecklistArticle({ slug }: { slug: string }) {
  const checklist = checklistBySlug(slug);
  if (!checklist) return null;
  const lang = checklistLanguage(checklist);
  const chrome = checklistChrome(lang);
  const url = `${SITE_URL}${checklistPath(slug)}`;
  const related = checklist.related
    .map((item) => checklistBySlug(item))
    .filter((item): item is NonNullable<typeof item> => item !== null);

  const structured = [
    {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: checklist.title,
      description: checklist.metaDescription,
      inLanguage: lang,
      dateModified: checklist.updated,
      mainEntityOfPage: url,
      author: { "@type": "Organization", name: "ZAVQERA", url: SITE_URL },
      publisher: { "@type": "Organization", name: "ZAVQERA", url: SITE_URL },
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      inLanguage: lang,
      mainEntity: checklist.faqs.map((faq) => ({ "@type": "Question", name: faq.question, acceptedAnswer: { "@type": "Answer", text: faq.answer } })),
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: chrome.checklistsLabel, item: `${SITE_URL}${checklistPath(undefined, lang)}` },
        { "@type": "ListItem", position: 2, name: checklist.short, item: url },
      ],
    },
  ];

  return (
    <div className="guide-page checklist-page" lang={lang} dir={chrome.dir ?? "ltr"}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(structured) }} />

      <header className="guide-header">
        <nav className="guide-crumbs" aria-label={chrome.checklistsLabel}>
          <Link href={checklistPath(undefined, lang)}>{chrome.checklistsLabel}</Link>
          <span aria-hidden="true">/</span>
          <span>{checklist.short}</span>
        </nav>
        <h1 className="guide-title">{checklist.title}</h1>
        {checklist.intro.map((paragraph) => <p className="guide-lead" key={paragraph}>{paragraph}</p>)}
        <p className="guide-meta">
          <span>{chrome.updated} <time dateTime={checklist.updated}>{checklist.updated}</time></span>
          <span aria-hidden="true">·</span>
          <span>{chrome.stepsCount(checklist.steps.length)}</span>
        </p>
        <dl className="checklist-facts">
          <div><dt>{chrome.whoFor}</dt><dd>{checklist.audience}</dd></div>
          <div><dt>{chrome.when}</dt><dd>{checklist.when}</dd></div>
        </dl>
      </header>

      <div className="guide-layout">
        <article className="guide-body">
          <div className="guide-cta-inline"><SaveChecklist slug={slug} /></div>

          <h2 id="steps">{chrome.steps}</h2>
          <ol className="guide-steps">
            {checklist.steps.map((step, index) => (
              <li className="guide-step" id={stepId(index)} key={step.heading}>
                <span className="guide-step-number" aria-hidden="true">{index + 1}</span>
                <div>
                  <h3>{step.heading}</h3>
                  <p>{step.detail}</p>
                  <p className="checklist-proof"><strong>{chrome.proofLabel}:</strong> {step.proof}</p>
                  {step.source ? (
                    <a className="guide-source" href={step.source.url} rel="noopener" target="_blank">
                      {chrome.sourceLabel}: {step.source.label} <span aria-hidden="true">↗</span>
                    </a>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>

          <h2 id="why-proof">{chrome.whyTitle}</h2>
          {chrome.why.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
          <h3>{chrome.repeatTitle}</h3>
          <p>{chrome.repeat}</p>

          <h2 id="faq">{chrome.faq}</h2>
          <div className="guide-faq">
            {checklist.faqs.map((faq) => (
              <details key={faq.question}>
                <summary>{faq.question}</summary>
                <p>{faq.answer}</p>
              </details>
            ))}
          </div>
          <p className="guide-disclaimer">{chrome.disclaimer}</p>
        </article>

        <aside className="guide-aside">
          <nav className="guide-toc" aria-label={chrome.onThisPage}>
            <strong>{chrome.onThisPage}</strong>
            <ol>
              {checklist.steps.map((step, index) => <li key={step.heading}><a href={`#${stepId(index)}`}>{step.heading}</a></li>)}
            </ol>
            <a href="#faq">{chrome.faq}</a>
          </nav>
          <SaveChecklist slug={slug} compact />
        </aside>
      </div>

      {related.length ? (
        <section className="guide-related" aria-labelledby="related">
          <h2 id="related">{chrome.related}</h2>
          <div className="guide-cards">
            {related.map((item) => (
              <Link className="guide-card" key={item.slug} href={checklistPath(item.slug)}>
                <strong>{item.title}</strong>
                <span>{chrome.stepsCount(item.steps.length)}</span>
              </Link>
            ))}
          </div>
          <p><Link href={checklistPath(undefined, lang)}>{chrome.allChecklists} <span aria-hidden="true">{chrome.dir === "rtl" ? "←" : "→"}</span></Link></p>
          {chrome.taskTracker ? <p><Link href={taskTrackerPath(lang)}>{chrome.taskTracker} <span aria-hidden="true">←</span></Link></p> : null}
        </section>
      ) : null}
    </div>
  );
}

export function ChecklistsIndex({ lang = "en" }: { lang?: string }) {
  const chrome = checklistChrome(lang);
  const list = checklistsIn(lang);
  let number = 0;
  const structured = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: list.map((checklist, index) => ({ "@type": "ListItem", position: index + 1, url: `${SITE_URL}${checklistPath(checklist.slug)}`, name: checklist.title })),
  };
  return (
    <div className="guide-page checklist-page" lang={lang} dir={chrome.dir ?? "ltr"}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(structured) }} />
      <header className="guide-header guide-index-header">
        <h1 className="guide-title">{chrome.indexTitle}</h1>
        <p className="guide-lead">{chrome.indexLead}</p>
        <p className="guide-meta"><span>{chrome.indexNote}</span></p>
        {chrome.taskTracker ? <p><Link href={taskTrackerPath(lang)}>{chrome.taskTracker} <span aria-hidden="true">←</span></Link></p> : null}
      </header>
      {CHECKLIST_GROUPS.map((group) => {
        const inGroup = list.filter((checklist) => checklist.group === group);
        if (!inGroup.length) return null;
        return (
          <section className="guide-country" key={group} aria-labelledby={`checklists-${group}`}>
            <h2 id={`checklists-${group}`} className="guide-country-title">{chrome.groupHeading[group]}</h2>
            <div className="guide-cards guide-index-cards">
              {inGroup.map((checklist) => {
                number += 1;
                return (
                  <Link className="guide-card" key={checklist.slug} href={checklistPath(checklist.slug)}>
                    <span className="guide-card-index" aria-hidden="true">{String(number).padStart(2, "0")}</span>
                    <strong>{checklist.title}</strong>
                    <p>{checklist.metaDescription}</p>
                    <span>{chrome.stepsCount(checklist.steps.length)}</span>
                    <span className="guide-card-more">{chrome.open} <span aria-hidden="true">{chrome.dir === "rtl" ? "←" : "→"}</span></span>
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
