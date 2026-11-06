import type { Metadata } from "next";
import "./globals.css";
import { Shell, readSignedIn } from "../components/shell";
import { PageMetrics } from "../components/page-metrics";
import { getLanguage, getTranslate } from "../lib/i18n-server";

export const metadata: Metadata = { title: "ZAVQERA Mission Control", description: "Structure AI-assisted work into explicit Missions, track progress, and review evidence before committing to outcomes." };

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
        <Shell signedIn={signedIn} navLabel={t("Primary navigation")}>{children}</Shell>
        <PageMetrics />
      </body>
    </html>
  );
}
