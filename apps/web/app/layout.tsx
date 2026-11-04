import type { Metadata } from "next";
import "./globals.css";
import { Shell } from "../components/shell";

export const metadata: Metadata = { title: "ZAVQERA Mission Control", description: "Structure AI-assisted work into explicit Missions, track progress, and review evidence before committing to outcomes." };

// Resolve the theme before first paint so a dark-mode visitor never sees a
// white flash. Mirrors the precedence in components/theme-switcher.tsx:
// stored choice, then cookie, then the operating system setting.
const themeBootstrap = `(function(){try{var t=null;try{t=localStorage.getItem('zavqera-theme')}catch(e){}
if(t!=='light'&&t!=='dark'){var c=document.cookie.split('; ').filter(function(p){return p.indexOf('zavqera-theme=')===0})[0];t=c?c.split('=')[1]:null}
if(t!=='light'&&t!=='dark'){t=(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light'}
document.documentElement.dataset.theme=t;document.documentElement.style.colorScheme=t}catch(e){}})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body><Shell>{children}</Shell></body>
    </html>
  );
}
