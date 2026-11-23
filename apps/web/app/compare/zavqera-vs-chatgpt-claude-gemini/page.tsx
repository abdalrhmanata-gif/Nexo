import type { Metadata } from "next";
import Link from "next/link";
import { COMPARE_PATH, COMPARE_SOURCES, compare, type CompareSourceKey } from "../../../lib/compare";
import { SITE_URL } from "../../../lib/guides";

// English only for now; every word lives in lib/compare.ts with its sources.

const url = `${SITE_URL}${COMPARE_PATH}`;

export const metadata: Metadata = {
  title: compare.metaTitle,
  description: compare.metaDescription,
  alternates: { canonical: url },
  openGraph: { title: compare.metaTitle, description: compare.metaDescription, url, type: "article", siteName: "ZAVQERA", locale: "en" },
  twitter: { card: "summary", title: compare.metaTitle, description: compare.metaDescription },
};

/** JSON for a <script> tag: "<" escaped so content can never close the tag. */
function jsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export default function ComparePage() {
  const usedSources = [...new Set(compare.assistants.flatMap((item) => item.points.map((point) => point.source as CompareSourceKey)))];
  const structured = [
    {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: compare.title,
      description: compare.metaDescription,
      inLanguage: "en",
      dateModified: compare.checked,
      mainEntityOfPage: url,
      author: { "@type": "Organization", name: "ZAVQERA", url: SITE_URL },
      publisher: { "@type": "Organization", name: "ZAVQERA", url: SITE_URL },
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      inLanguage: "en",
      mainEntity: compare.faqs.map((faq) => ({ "@type": "Question", name: faq.question, acceptedAnswer: { "@type": "Answer", text: faq.answer } })),
    },
  ];

  return (
    <div className="compare-page" lang="en" dir="ltr">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(structured) }} />

      <header className="guide-header compare-header">
        <p className="eyebrow">{compare.eyebrow}</p>
        <h1 className="guide-title">{compare.title}</h1>
        {compare.lead.map((paragraph) => <p className="guide-lead" key={paragraph}>{paragraph}</p>)}
      </header>

      <section aria-labelledby="compare-table">
        <h2 id="compare-table">{compare.tableTitle}</h2>
        <div className="compare-table-wrap">
          <table className="compare-table">
            <caption>{compare.tableCaption}</caption>
            <thead>
              <tr>
                <th scope="col">{compare.columns.feature}</th>
                <th scope="col">{compare.columns.assistants}</th>
                <th scope="col" className="compare-ours">{compare.columns.zavqera}</th>
              </tr>
            </thead>
            <tbody>
              {compare.rows.map((row) => (
                <tr key={row.feature}>
                  <th scope="row">{row.feature}</th>
                  <td data-label={compare.columns.assistants}>{row.assistants}</td>
                  <td data-label={compare.columns.zavqera} className="compare-ours">{row.zavqera}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="compare-assistants">
        <h2 id="compare-assistants">{compare.assistantsTitle}</h2>
        <p className="compare-text">{compare.assistantsLead}</p>
        <div className="compare-cards">
          {compare.assistants.map((item) => (
            <article className="compare-card" key={item.name}>
              <h3>{item.name}</h3>
              <ul>
                {item.points.map((point) => {
                  const source = COMPARE_SOURCES[point.source as CompareSourceKey];
                  return (
                    <li key={point.text}>
                      {point.text}{" "}
                      <a className="guide-source" href={source.url} rel="noopener" target="_blank">{source.label} <span aria-hidden="true">↗</span></a>
                    </li>
                  );
                })}
              </ul>
            </article>
          ))}
        </div>
        <p className="guide-disclaimer">{compare.checkedNote}</p>
      </section>

      <section aria-labelledby="compare-when">
        <h2 id="compare-when">{compare.whenTitle}</h2>
        <ul className="compare-when">
          {compare.when.map((item) => <li key={item.lead}><strong>{item.lead}</strong> {item.text}</li>)}
        </ul>
      </section>

      <section className="guide-cta compare-cta" aria-labelledby="compare-cta">
        <strong className="guide-cta-title" id="compare-cta">{compare.ctaTitle}</strong>
        <p>{compare.ctaBody}</p>
        <div className="compare-cta-actions">
          <Link className="button guide-cta-button" href="/auth/sign-up">{compare.ctaPrimary} <span aria-hidden="true">→</span></Link>
          <Link className="compare-cta-secondary" href="/templates/business-opportunity-scan">{compare.ctaSecondary} <span aria-hidden="true">→</span></Link>
        </div>
      </section>

      <section aria-labelledby="compare-faq">
        <h2 id="compare-faq">{compare.faqTitle}</h2>
        <div className="guide-faq">
          {compare.faqs.map((faq) => (
            <details key={faq.question}>
              <summary>{faq.question}</summary>
              <p>{faq.answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section aria-labelledby="compare-sources">
        <h2 id="compare-sources">{compare.sourcesTitle}</h2>
        <ul className="guide-sources">
          {usedSources.map((key) => (
            <li key={key}><a href={COMPARE_SOURCES[key].url} rel="noopener" target="_blank">{COMPARE_SOURCES[key].label} <span aria-hidden="true">↗</span></a></li>
          ))}
        </ul>
        <p className="guide-disclaimer">{compare.disclosure}</p>
      </section>
    </div>
  );
}
