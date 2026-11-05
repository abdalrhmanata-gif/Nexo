import Link from "next/link";
import { SignOutButton } from "./auth-form";
import { LanguageSwitcher } from "./language-switcher";
import { LocalizedText } from "./localized-text";
import { NavLink, WorkspaceNavLink } from "./nav-link";
import { NotificationBell } from "./notification-bell";
import { ThemeSwitcher } from "./theme-switcher";
import { isSupabaseConfigured } from "../lib/supabase/config";
import { createSupabaseServerClient } from "../lib/supabase/server";

function NavIcon({ name }: { name: "search" | "plus" | "business" | "templates" | "pricing" | "workspace" | "opportunities" }) {
  const common = { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true as const };
  switch (name) {
    case "search": return <svg {...common}><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.5 4.5" /></svg>;
    case "plus": return <svg {...common}><path d="M12 5v14M5 12h14" /></svg>;
    case "business": return <svg {...common}><rect x="3" y="7" width="18" height="14" rx="2" /><path d="M8 7V4h8v3M7 12h.01M12 12h.01M17 12h.01M7 16h.01M12 16h.01M17 16h.01" /></svg>;
    case "templates": return <svg {...common}><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></svg>;
    case "pricing": return <svg {...common}><path d="M12 3v18M17 7.5c0-1.7-2.1-3-5-3s-5 1.2-5 3 1.7 2.6 5 3 5 1.3 5 3.1-2 3.4-5 3.4-5-1.3-5-3" /></svg>;
    case "workspace": return <svg {...common}><path d="M3 3h8v8H3zM13 3h8v5h-8zM13 10h8v11h-8zM3 13h8v8H3z" /></svg>;
    case "opportunities": return <svg {...common}><path d="M4 19V12M10 19V5M16 19V9M22 19V3" /></svg>;
  }
}

// Every /app route is behind the middleware. Rendering the workspace nav to a
// signed-out visitor meant each of those links silently bounced them to the
// sign-in page, which reads as a broken button. The header now follows the
// session: a visitor gets a short public nav and a clear way in, and only a
// signed-in user sees the workspace links.
// Read in the root layout rather than here: Next special-cases the default
// export of layout.tsx, so an async layout type-checks under the React 18
// types this project pins, while an async non-page component used as JSX does
// not reliably.
export async function readSignedIn(): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    return Boolean(user);
  } catch {
    // Treat an unreadable session as signed out rather than failing the page.
    return false;
  }
}

export function Shell({ children, signedIn = false }: { children: React.ReactNode; signedIn?: boolean }) {
  return (
    <div className="site-shell">
      <header className="topbar">
        <Link className="brand" href="/" prefetch={false}>
          <span className="brand-wordmark">ZAVQERA</span>
          <span className="brand-subtitle"><LocalizedText en="MISSION CONTROL" nb="KONTROLLSENTER" ar="مركز التحكم" /></span>
          <span className="visually-hidden"><LocalizedText en="Home" nb="Hjem" ar="الرئيسية" /></span>
        </Link>
        <nav className="primary-nav" aria-label="Primary navigation">
          {signedIn && <>
            <Link className="nav-link nav-search" href="/app#mission-search" prefetch={false}><NavIcon name="search" /><LocalizedText en="Search" nb="Søk" ar="بحث" /></Link>
            <Link className="nav-link nav-new-mission" href="/app/missions/new" prefetch={false}><NavIcon name="plus" /><LocalizedText en="New mission" nb="Nytt oppdrag" ar="مهمة جديدة" /></Link>
            <NavLink className="nav-link nav-business" href="/app/business"><NavIcon name="business" /><LocalizedText en="Business" nb="Bedrift" ar="الأعمال" /></NavLink>
          </>}
          <NavLink className="nav-link nav-templates" href="/templates"><NavIcon name="templates" /><LocalizedText en="Templates" nb="Maler" ar="القوالب" /></NavLink>
          <NavLink className="nav-link nav-pricing" href="/pricing"><NavIcon name="pricing" /><LocalizedText en="Pricing" nb="Priser" ar="الأسعار" /></NavLink>
          {signedIn && <>
            <WorkspaceNavLink />
            <NavLink href="/app/opportunities" className="nav-link nav-opportunities"><NavIcon name="opportunities" /><LocalizedText en="Opportunity Intelligence" nb="Mulighetsanalyse" ar="تحليل الفرص" /></NavLink>
            <NotificationBell />
          </>}
          <LanguageSwitcher />
          <ThemeSwitcher />
          {signedIn
            ? <SignOutButton />
            : <>
              <Link className="nav-link nav-sign-in" href="/auth/sign-in"><LocalizedText en="Sign in" /></Link>
              <Link className="button button-small nav-start-free" href="/auth/sign-up"><LocalizedText en="Start free" /></Link>
            </>}
        </nav>
      </header>
      <main>{children}</main>
      <footer className="footer"><LocalizedText en="A calm control plane for bounded AI work." nb="Et oversiktlig kontrollsenter for avgrenset KI-arbeid." ar="مركز تحكم واضح للعمل بالذكاء الاصطناعي ضمن حدود محددة." /></footer>
    </div>
  );
}

export function StatusPill({ status }: { status: string }) {
  const label = status === "WAITING" ? <LocalizedText en="Needs input" nb="Trenger avklaring" ar="يتطلب تدخلك" /> : status === "ACTIVE" ? <LocalizedText en="Active" nb="Aktiv" ar="نشطة" /> : status === "COMPLETED" ? <LocalizedText en="Completed" nb="Fullført" ar="مكتملة" /> : status;
  return <span className={`status status-${status.toLowerCase()}`}>{label}</span>;
}
