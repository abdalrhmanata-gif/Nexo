import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { COMPARE_PATH, compare } from "../../../lib/compare";
import { SITE_URL } from "../../../lib/guides";
import {
  COMPARE_TOOLS_CHROME as C,
  TOOL_COMPARISONS,
  ZAVQERA_FACTS,
  checkedDate,
  toolComparisonBySlug,
  toolComparisonPath,
  zavqeraCell,
} from "../../../lib/compare-tools.mjs";

// ZAVQERA next to another checklist tool. English only; every word and every
// source lives in lib/compare-tools.mjs, which its test keeps honest.

export const dynamicParams = false;

export function generateStaticParams() {
  return TOOL_COMPARISONS.map((item) => ({ slug: item.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const item = toolComparisonBySlug((await params).slug);
  if (!item) return {};
  const url = `${SITE_URL}${toolComparisonPath(item.slug)}`;
  return {
    title: item.metaTitle,
    description: item.metaDescription,
    alternates: { canonical: url },
    openGraph: { title: item.metaTitle, description: item.metaDescription, url, type: "article", siteName: "ZAVQERA", locale: "en" },
    twitter: { card: "summary", title: item.metaTitle, description: item.metaDescription },
  };
}

/** JSON for a <script> tag: "<" escaped so content can never close the tag. */
function jsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export default async function ToolComparisonPage({ params }: { params: Promise<{ slug: string }> }) {
  const item = toolComparisonBySlug((await params).slug);
  if (!item) notFound();
  const url = `${SITE_URL}${toolComparisonPath(item.slug)}`;
  const others = TOOL_COMPARISONS.filter((other) => other.slug !== item.slug);
  const structured = [
    {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: item.title,
      description: item.metaDescription,
      inLanguage: "en",
      dateModified: item.checked,
      mainEntityOfPage: url,
      author: { "@type": "Organization", name: "ZAVQERA", url: SITE_URL },
      publisher: { "@type": "Organization", name: "ZAVQERA", url: SITE_URL },
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      inLanguage: "en",
      mainEntity: item.faqs.map((faq) => ({ "@type": "Question", name: faq.question, acceptedAnswer: { "@type": "Answer", text: faq.answer } })),
    },
  ];
  const sourceLink = (key?: string) => {
    const source = key ? item.sources[key] : undefined;
    return source ? <> <a className="guide-source" href={source.url} rel="noopener" target="_blank">{source.label} <span aria-hidden="true">↗</span></a></> : null;
  };

  return (
    <div className="compare-page" lang="en" dir="ltr">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(structured) }} />

      <header className="guide-header compare-header">
        <p className="eyebrow">{C.eyebrow}</p>
        <h1 className="guide-title">{item.title}</h1>
        {item.lead.map((paragraph) => <p className="guide-lead" key={paragraph}>{paragraph}</p>)}
      </header>

      <section aria-labelledby="compare-table">
        <h2 id="compare-table">{C.tableTitle}</h2>
        <div className="compare-table-wrap">
          <table className="compare-table">
            <caption>{C.tableCaption(checkedDate(item.checked))}</caption>
            <thead>
              <tr>
                <th scope="col">{C.featureColumn}</th>
                <th scope="col">{item.competitor}</th>
                <th scope="col" className="compare-ours">{"ZAVQERA"}</th>
              </tr>
            </thead>
            <tbody>
              {item.rows.map((row) => (
                <tr key={row.feature}>
                  <th scope="row">{row.feature}</th>
                  <td data-label={item.competitor}>{row.them}{sourceLink(row.source)}</td>
                  <td data-label={"ZAVQERA"} className="compare-ours">{zavqeraCell(row.zavqera)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="compare-strengths">
        <h2 id="compare-strengths">{C.strengthsTitle(item.competitor)}</h2>
        <ul className="compare-when">
          {item.theyDoWell.map((point) => <li key={point.text}>{point.text}{sourceLink(point.source)}</li>)}
        </ul>
      </section>

      <section aria-labelledby="compare-gaps">
        <h2 id="compare-gaps">{C.gapsTitle}</h2>
        <ul className="compare-when">
          {ZAVQERA_FACTS.gaps.map((gap) => <li key={gap}>{gap}</li>)}
        </ul>
      </section>

      <section aria-labelledby="compare-when">
        <h2 id="compare-when">{C.whenTitle}</h2>
        <ul className="compare-when">
          <li><strong>{C.chooseThem(item.competitor)}</strong> {`if ${item.choose.them}`}</li>
          <li><strong>{C.chooseZavqera}</strong> {`if ${item.choose.zavqera}`}</li>
        </ul>
      </section>

      <section className="guide-cta compare-cta" aria-labelledby="compare-cta">
        <strong className="guide-cta-title" id="compare-cta">{C.ctaTitle}</strong>
        <p>{C.ctaBody}</p>
        <div className="compare-cta-actions">
          <Link className="button guide-cta-button" href="/auth/sign-up">{C.ctaPrimary} <span aria-hidden="true">→</span></Link>
          <Link className="compare-cta-secondary" href="/checklists">{C.ctaSecondary} <span aria-hidden="true">→</span></Link>
        </div>
      </section>

      <section aria-labelledby="compare-faq">
        <h2 id="compare-faq">{C.faqTitle}</h2>
        <div className="guide-faq">
          {item.faqs.map((faq) => (
            <details key={faq.question}>
              <summary>{faq.question}</summary>
              <p>{faq.answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section aria-labelledby="compare-more">
        <h2 id="compare-more">{C.moreTitle}</h2>
        <ul className="compare-when">
          {others.map((other) => <li key={other.slug}><Link href={toolComparisonPath(other.slug)}>{other.title}</Link></li>)}
          <li><Link href={COMPARE_PATH}>{compare.title}</Link></li>
        </ul>
      </section>

      <section aria-labelledby="compare-sources">
        <h2 id="compare-sources">{C.sourcesTitle}</h2>
        <ul className="guide-sources">
          {Object.values(item.sources).map((source) => (
            <li key={source.url}><a href={source.url} rel="noopener" target="_blank">{source.label} <span aria-hidden="true">↗</span></a></li>
          ))}
        </ul>
        <p className="guide-disclaimer">{C.disclosure(item, checkedDate(item.checked))}</p>
      </section>
    </div>
  );
}
