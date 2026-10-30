import Link from "next/link";
import { SignOutButton } from "./auth-form";
import { LanguageSwitcher } from "./language-switcher";
import { LocalizedText } from "./localized-text";
import { NavLink, WorkspaceNavLink } from "./nav-link";
import { NotificationBell } from "./notification-bell";

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

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="site-shell">
      <header className="topbar">
        <Link className="brand" href="/" aria-label="Zavqera home">
          <span className="brand-wordmark">ZAVQERA</span>
          <span className="brand-subtitle"><LocalizedText en="MISSION CONTROL" nb="KONTROLLSENTER" ar="مركز التحكم" /></span>
        </Link>
        <nav className="primary-nav" aria-label="Primary navigation">
          <Link className="nav-link nav-search" href="/app#mission-search"><NavIcon name="search" /><LocalizedText en="Search" nb="Søk" ar="بحث" /></Link>
          <Link className="nav-link nav-new-mission" href="/app/missions/new"><NavIcon name="plus" /><LocalizedText en="New mission" nb="Nytt oppdrag" ar="مهمة جديدة" /></Link>
          <NavLink className="nav-link nav-business" href="/app/business"><NavIcon name="business" /><LocalizedText en="Business" nb="Bedrift" ar="الأعمال" /></NavLink>
          <NavLink className="nav-link nav-templates" href="/templates"><NavIcon name="templates" /><LocalizedText en="Templates" nb="Maler" ar="القوالب" /></NavLink>
          <NavLink className="nav-link nav-pricing" href="/pricing"><NavIcon name="pricing" /><LocalizedText en="Pricing" nb="Priser" ar="الأسعار" /></NavLink>
          <WorkspaceNavLink />
          <NavLink href="/app/opportunities" className="nav-link nav-opportunities"><NavIcon name="opportunities" /><LocalizedText en="Opportunity Intelligence" nb="Mulighetsanalyse" ar="تحليل الفرص" /></NavLink>
          <NotificationBell />
          <LanguageSwitcher />
          <SignOutButton />
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
