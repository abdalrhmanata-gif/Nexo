import type { Metadata } from "next";
import Link from "next/link";
import { COMPARE_PATH, compare } from "../../lib/compare";
import { COMPARE_TOOLS_CHROME as C, TOOL_COMPARISONS, toolComparisonPath } from "../../lib/compare-tools.mjs";
import { SITE_URL } from "../../lib/guides";

// Every comparison page in one list, so people and crawlers find them all.

const title = C.indexMetaTitle;
const description = C.indexMetaDescription;

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}${toolComparisonPath()}` },
  openGraph: { title, description, url: `${SITE_URL}${toolComparisonPath()}`, type: "website", siteName: "ZAVQERA", locale: "en" },
  twitter: { card: "summary", title, description },
};

export default function CompareIndexPage() {
  const pages = [
    ...TOOL_COMPARISONS.map((item) => ({ href: toolComparisonPath(item.slug), title: item.title, description: item.metaDescription })),
    { href: COMPARE_PATH, title: compare.title, description: compare.metaDescription },
  ];
  return (
    <div className="compare-page" lang="en" dir="ltr">
      <header className="guide-header compare-header">
        <p className="eyebrow">{C.indexEyebrow}</p>
        <h1 className="guide-title">{C.indexTitle}</h1>
        <p className="guide-lead">{C.indexLead}</p>
      </header>
      <ul className="compare-when">
        {pages.map((page) => (
          <li key={page.href}><Link href={page.href}><strong>{page.title}</strong></Link><br />{page.description}</li>
        ))}
      </ul>
    </div>
  );
}
