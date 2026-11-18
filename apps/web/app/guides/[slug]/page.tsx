import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SITE_URL, guideBySlug, guideMissionHref, guides } from "../../../lib/guides";

// English on purpose: see the header of lib/guides.ts.

export const dynamicParams = false;

export function generateStaticParams() {
  return guides.map((guide) => ({ slug: guide.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const guide = guideBySlug((await params).slug);
  if (!guide) return { title: "ZAVQERA" };
  const url = `${SITE_URL}/guides/${guide.slug}`;
  return {
    title: guide.metaTitle,
    description: guide.metaDescription,
    alternates: { canonical: url },
    openGraph: { title: guide.metaTitle, description: guide.metaDescription, url, type: "article", siteName: "ZAVQERA" },
    twitter: { card: "summary", title: guide.metaTitle, description: guide.metaDescription },
  };
}

/** JSON for a <script> tag: "<" escaped so content can never close the tag. */
function jsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export default async function GuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const guide = guideBySlug((await params).slug);
  if (!guide) notFound();
  const url = `${SITE_URL}/guides/${guide.slug}`;
  const missionHref = guideMissionHref(guide);
  const related = guide.related
    .map((slug) => guideBySlug(slug))
    .filter((item): item is NonNullable<typeof item> => item !== null);

  const structured = [
    {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: guide.title,
      description: guide.metaDescription,
      dateModified: guide.updated,
      mainEntityOfPage: url,
      author: { "@type": "Organization", name: "ZAVQERA", url: SITE_URL },
      publisher: { "@type": "Organization", name: "ZAVQERA", url: SITE_URL },
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: guide.faqs.map((faq) => ({
        "@type": "Question",
        name: faq.question,
        acceptedAnswer: { "@type": "Answer", text: faq.answer },
      })),
    },
  ];

  return (
    <article className="container templates-page" lang="en" dir="ltr">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(structured) }} />
      <p className="eyebrow"><Link href="/guides">Guides</Link> / {guide.mission.name}</p>

      <section className="hero template-hero-panel">
        <div>
          <h1>{guide.title}</h1>
          {guide.intro.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
          <p className="form-note">Last checked against official sources: {guide.updated}</p>
        </div>
        <div className="landing-final-actions">
          <Link className="button" href={missionHref}>Turn this into my plan <span aria-hidden="true">→</span></Link>
        </div>
      </section>

      <h2 id="steps-heading">Steps</h2>
      <section className="grid" aria-labelledby="steps-heading">
        {guide.steps.map((step) => (
          <article className="card" key={step.heading}>
            <h3>{step.heading}</h3>
            {step.body.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            {step.source ? (
              <p className="form-note">Official source: <a href={step.source.url} rel="noopener" target="_blank">{step.source.label}</a></p>
            ) : null}
          </article>
        ))}
      </section>

      <section className="landing-final-cta">
        <div>
          <h2>Track these steps until they are done</h2>
          <p>ZAVQERA turns this guide into your own plan: each step becomes an action you can tick off, with a place to keep the proof (confirmation letters, filing numbers) next to it. Free to start.</p>
        </div>
        <div className="landing-final-actions">
          <Link className="button" href={missionHref}>Turn this into my plan <span aria-hidden="true">→</span></Link>
        </div>
      </section>

      <section className="card" aria-labelledby="faq-heading">
        <h2 id="faq-heading">Frequently asked questions</h2>
        {guide.faqs.map((faq) => (
          <div key={faq.question}>
            <h3>{faq.question}</h3>
            <p>{faq.answer}</p>
          </div>
        ))}
      </section>

      <section className="card" aria-labelledby="sources-heading">
        <h2 id="sources-heading">Sources</h2>
        <ul className="list">
          {guide.sources.map((source) => (
            <li key={source.url}><a href={source.url} rel="noopener" target="_blank">{source.label}</a></li>
          ))}
        </ul>
        <p className="form-note">This guide is general information, not legal or tax advice. Rules and fees change and differ by state; the linked official pages are the authority.</p>
      </section>

      {related.length ? (
        <section className="card" aria-labelledby="related-heading">
          <h2 id="related-heading">Related guides</h2>
          <ul className="list">
            {related.map((item) => <li key={item.slug}><Link href={`/guides/${item.slug}`}>{item.title}</Link></li>)}
          </ul>
        </section>
      ) : null}
    </article>
  );
}
