// What ZAVQERA is, in the shape search engines and AI assistants read
// (schema.org JSON-LD), for the home page.
//
// Facts only: the prices are the ones on /pricing (a test compares them), the
// profiles are ones the company runs, and there is no rating or review count
// until real reviews exist. Kept as .mjs so the unit tests run it directly on
// the Node version Netlify builds with.

export const SITE_URL = "https://zavqera.com";

/** The company's own profiles elsewhere, so engines connect them to this site. */
export const PROFILES = Object.freeze([
  "https://www.youtube.com/@ZAVQERA",
  "https://www.g2.com/products/zavqera/reviews",
  "https://www.crunchbase.com/organization/zavqera",
]);

/** Monthly prices in US dollars, as /pricing shows them. */
export const PLAN_PRICES_USD = Object.freeze({ Free: 0, Plus: 19, Pro: 49, Scale: 69 });

/** The sentence a search result shows under the name; also the layout's description. */
export const SITE_DESCRIPTION = "Checklists and plans for small teams: give every step an owner, keep proof when it is done, and see what is late. Free plan, no card.";

/** What the product does, each one live on zavqera.com. */
export const FEATURES = Object.freeze([
  "Checklists and plans with an owner and proof on every step",
  "Ready-made checklists for onboarding, offboarding, month-end close, client handoffs and more",
  "Due dates, late-step warnings and a calendar link",
  "AI first drafts of a plan",
  "Team workspaces with edit and view roles",
  "Read-only share links to a result",
  "Six languages: English, Norwegian, Arabic, Spanish, French and German",
  "Works inside AI assistants through the Model Context Protocol",
]);

export function homeStructuredData() {
  const organizationId = `${SITE_URL}/#organization`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": organizationId,
        name: "ZAVQERA",
        url: SITE_URL,
        logo: { "@type": "ImageObject", url: `${SITE_URL}/brand/zavqera-icon-512.png`, width: 512, height: 512 },
        email: "hello@zavqera.com",
        foundingDate: "2026",
        sameAs: [...PROFILES],
      },
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        name: "ZAVQERA",
        url: SITE_URL,
        publisher: { "@id": organizationId },
        inLanguage: ["en", "nb", "ar", "es", "fr", "de"],
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${SITE_URL}/#software`,
        name: "ZAVQERA",
        url: SITE_URL,
        description: SITE_DESCRIPTION,
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        publisher: { "@id": organizationId },
        featureList: [...FEATURES],
        offers: Object.entries(PLAN_PRICES_USD).map(([name, price]) => ({
          "@type": "Offer",
          name,
          price: String(price),
          priceCurrency: "USD",
          url: `${SITE_URL}/pricing`,
        })),
      },
    ],
  };
}

/** JSON for a <script type="application/ld+json">, safe inside HTML. */
export function jsonLdScript(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
