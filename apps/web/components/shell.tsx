import Link from "next/link";
import { SignOutButton } from "./auth-form";
import { LanguageSwitcher } from "./language-switcher";
import { LocalizedText } from "./localized-text";
import { NavLink, WorkspaceNavLink } from "./nav-link";
import { NotificationBell } from "./notification-bell";

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="site-shell">
      <header className="topbar">
        <Link className="brand" href="/">
          ZAVQERA <span><LocalizedText en="MISSION CONTROL" nb="KONTROLLSENTER" ar="مركز التحكم" /></span>
        </Link>
        <nav aria-label="Primary navigation">
          <Link className="button button-small button-quiet nav-search" href="/app#mission-search"><span aria-hidden="true">⌕</span><LocalizedText en="Search" nb="Søk" ar="بحث" /></Link>
          <NavLink href="/app/missions/new" className="button button-small"><LocalizedText en="New mission" nb="Nytt oppdrag" ar="مهمة جديدة" /></NavLink>
          <NavLink className="nav-featured nav-business" href="/app/business"><LocalizedText en="Business" nb="Bedrift" ar="الأعمال" /></NavLink>
          <NavLink className="nav-featured nav-templates" href="/templates"><LocalizedText en="Templates" nb="Maler" ar="القوالب" /></NavLink>
          <NavLink href="/pricing"><LocalizedText en="Pricing" nb="Priser" ar="الأسعار" /></NavLink>
          <WorkspaceNavLink />
          <NavLink href="/app/opportunities" className="nav-opportunities"><LocalizedText en="Opportunity Intelligence" nb="Mulighetsanalyse" ar="تحليل الفرص" /></NavLink>
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
