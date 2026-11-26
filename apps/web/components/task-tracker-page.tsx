import type { Metadata } from "next";
import Link from "next/link";
import { SITE_URL } from "../lib/guides";
import { checklistPath, checklistsIn } from "../lib/checklists.mjs";
import { TASK_TRACKER_AR, taskTrackerPath } from "../lib/task-tracker.mjs";

// The employee task tracker landing page. Every visible word comes from
// lib/task-tracker.mjs, which is written in the page's language; the layout
// reuses the guide and checklist styles.

function jsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function copyFor(lang: string) {
  return lang === "ar" ? TASK_TRACKER_AR : null;
}

export function taskTrackerMetadata(lang: string): Metadata {
  const copy = copyFor(lang);
  if (!copy) return { title: "ZAVQERA" };
  const url = `${SITE_URL}${taskTrackerPath(lang)}`;
  return {
    title: { absolute: copy.metaTitle },
    description: copy.metaDescription,
    alternates: { canonical: url },
    openGraph: { title: copy.metaTitle, description: copy.metaDescription, url, type: "website", siteName: "ZAVQERA", locale: lang },
    twitter: { card: "summary", title: copy.metaTitle, description: copy.metaDescription },
  };
}

export function TaskTrackerPage({ lang }: { lang: string }) {
  const copy = copyFor(lang);
  if (!copy) return null;
  const arrow = copy.dir === "rtl" ? "←" : "→";
  const checklists = checklistsIn(lang);
  const structured = [
    {
      "@context": "https://schema.org",
      "@type": "WebPage",
      inLanguage: lang,
      name: copy.title,
      description: copy.metaDescription,
      url: `${SITE_URL}${taskTrackerPath(lang)}`,
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      inLanguage: lang,
      mainEntity: copy.faqs.map((faq) => ({ "@type": "Question", name: faq.question, acceptedAnswer: { "@type": "Answer", text: faq.answer } })),
    },
  ];
  return (
    <div className="guide-page checklist-page tracker-page" lang={lang} dir={copy.dir}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(structured) }} />

      <header className="guide-header">
        <p className="guide-meta"><span>{copy.eyebrow}</span></p>
        <h1 className="guide-title">{copy.title}</h1>
        <p className="guide-lead">{copy.lead}</p>
        <p className="tracker-actions">
          <Link className="button" href="/auth/sign-up">{copy.ctaPrimary} <span aria-hidden="true">{arrow}</span></Link>
          <Link className="button button-quiet" href={checklistPath(undefined, lang)}>{copy.ctaSecondary}</Link>
        </p>
        <p className="guide-meta"><span>{copy.ctaNote}</span></p>
      </header>

      <div className="guide-layout">
        <article className="guide-body">
          <h2 id="problem">{copy.problemTitle}</h2>
          <div className="guide-cards">
            {copy.problems.map((item) => (
              <div className="guide-card" key={item.heading}>
                <strong>{item.heading}</strong>
                <p>{item.detail}</p>
              </div>
            ))}
          </div>

          <h2 id="how">{copy.howTitle}</h2>
          <ol className="guide-steps">
            {copy.how.map((item, index) => (
              <li className="guide-step" key={item.heading}>
                <span className="guide-step-number" aria-hidden="true">{index + 1}</span>
                <div>
                  <h3>{item.heading}</h3>
                  <p>{item.detail}</p>
                </div>
              </li>
            ))}
          </ol>

          <h2 id="free">{copy.freeTitle}</h2>
          <ul>
            {copy.free.map((line) => <li key={line}>{line}</li>)}
          </ul>
          <p>{copy.paidNote} <Link href="/pricing">{copy.pricingLink}</Link></p>

          <h2 id="for">{copy.forTitle}</h2>
          <ul>
            {copy.forWho.map((line) => <li key={line}>{line}</li>)}
          </ul>

          <h2 id="faq">{copy.faqTitle}</h2>
          <div className="guide-faq">
            {copy.faqs.map((faq) => (
              <details key={faq.question}>
                <summary>{faq.question}</summary>
                <p>{faq.answer}</p>
              </details>
            ))}
          </div>
        </article>

        <aside className="guide-aside">
          <div className="guide-cta">
            <strong className="guide-cta-title">{copy.finalTitle}</strong>
            <p>{copy.finalBody}</p>
            <Link className="button guide-cta-button" href="/auth/sign-up">{copy.ctaPrimary} <span aria-hidden="true">{arrow}</span></Link>
            <small>{copy.ctaNote}</small>
          </div>
        </aside>
      </div>

      {checklists.length ? (
        <section className="guide-related" aria-labelledby="ready">
          <h2 id="ready">{copy.ctaSecondary}</h2>
          <div className="guide-cards">
            {checklists.map((item) => (
              <Link className="guide-card" key={item.slug} href={checklistPath(item.slug)}>
                <strong>{item.title}</strong>
                <p>{item.metaDescription}</p>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
