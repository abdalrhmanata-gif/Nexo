import type { Metadata } from "next";
import Link from "next/link";
import { SITE_URL, guides } from "../../lib/guides";

// English on purpose: see the header of lib/guides.ts.

export const metadata: Metadata = {
  title: "Free guides to starting a business in the US | ZAVQERA",
  description: "Step-by-step guides to starting a business, forming an LLC, getting an EIN, writing a business plan and opening a business bank account, with official sources.",
  alternates: { canonical: `${SITE_URL}/guides` },
};

export default function GuidesPage() {
  return (
    <div className="container templates-page" lang="en" dir="ltr">
      <section className="hero template-hero-panel">
        <div>
          <h1>Guides to starting a business</h1>
          <p>Each guide lists the steps in order and links to the official source for every rule or fee. When you are ready, turn a guide into your own plan and track it to done.</p>
        </div>
      </section>
      <h2 id="guides-heading">All guides</h2>
      <section className="grid" aria-labelledby="guides-heading">
        {guides.map((guide) => (
          <article className="card" key={guide.slug}>
            <h3><Link href={`/guides/${guide.slug}`}>{guide.title}</Link></h3>
            <p>{guide.metaDescription}</p>
          </article>
        ))}
      </section>
    </div>
  );
}
