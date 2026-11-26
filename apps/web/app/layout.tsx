import type { Metadata } from "next";
import "./globals.css";
import { Shell, readAccountSummary, readSignedIn, readSiteOperator } from "../components/shell";
import { readOpenSharedWorkspace } from "../lib/supabase/team-repository";
import { billingConfigured } from "../lib/stripe-client";
import { PageMetrics } from "../components/page-metrics";
import { UmamiAnalytics } from "../components/umami-analytics";
import { LanguageProvider } from "../components/localized-text";
import { getLanguage, getTranslate } from "../lib/i18n-server";
import { guidePath, isGuideLanguage } from "../lib/guides";

// The tab title and the description a search engine shows were English for
// every reader. They are read from the same dictionary as the page.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslate();
  return {
    title: t("ZAVQERA — Checklists with an owner and proof on every step"),
    // The same sentence as the home page's structured data (lib/site-schema.mjs).
    description: t("Checklists and plans for small teams: give every step an owner, keep proof when it is done, and see what is late. Free plan, no card."),
  };
}

// Resolve the theme before first paint so a dark-mode visitor never sees a
// white flash. Mirrors the precedence in components/theme-switcher.tsx:
// stored choice, then cookie, then the operating system setting.
const themeBootstrap = `(function(){try{var t=null;try{t=localStorage.getItem('zavqera-theme')}catch(e){}
if(t!=='light'&&t!=='dark'){var c=document.cookie.split('; ').filter(function(p){return p.indexOf('zavqera-theme=')===0})[0];t=c?c.split('=')[1]:null}
if(t!=='light'&&t!=='dark'){t=(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light'}
document.documentElement.dataset.theme=t;document.documentElement.style.colorScheme=t}catch(e){}})()`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // The header has to follow the session: every /app link is behind the
  // middleware, so showing them to a signed-out visitor made each one bounce
  // to the sign-in page and read as a dead button.
  const signedIn = await readSignedIn();
  // Independent reads, so they run together rather than one after another:
  // each is a round trip to the database.
  const [siteOperator, sharedWorkspace, account] = signedIn
    ? await Promise.all([readSiteOperator(), readOpenSharedWorkspace(), readAccountSummary()])
    : [false, null, null];
  // Render lang and dir from the saved language rather than hardcoding
  // English: an Arabic visitor otherwise gets a left-to-right first paint,
  // and assistive technology is told the wrong language for the whole page.
  const language = await getLanguage();
  const t = await getTranslate();
  return (
    <html lang={language} dir={language === "ar" ? "rtl" : "ltr"} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body>
        {/* The language resolved above reaches every client component, so
            the HTML that leaves the server is already in it. */}
        <LanguageProvider initial={language}>
          <Shell signedIn={signedIn} siteOperator={siteOperator} sharedWorkspace={sharedWorkspace} account={account} billing={billingConfigured()} navLabel={t("Primary navigation")} guidesHref={guidePath(isGuideLanguage(language) ? language : "en")}>{children}</Shell>
        </LanguageProvider>
        <PageMetrics />
        <UmamiAnalytics />
      </body>
    </html>
  );
}
