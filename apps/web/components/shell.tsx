import Link from "next/link";
import { SignOutButton } from "./auth-form";
import { LanguageSwitcher } from "./language-switcher";
import { LocalizedText } from "./localized-text";
import { NavLink, WorkspaceNavLink } from "./nav-link";

export function Shell({ children }: { children: React.ReactNode }) {
  return <div className="site-shell">
    <header className="topbar">
      <Link className="brand" href="/">ZAVQERA <span><LocalizedText en="MISSION CONTROL" /></span></Link>
      <nav aria-label="Primary navigation">
        <Link className="button button-small button-quiet nav-search" href="/app#mission-search"><span aria-hidden="true">⌕</span><LocalizedText en="Search" nb="Søk" ar="بحث" /></Link>
        <Link className="button button-small" href="/app/missions/new"><LocalizedText en="New mission" /></Link>
        <NavLink href="/app/business"><LocalizedText en="Business" nb="Bedrift" ar="الأعمال" /></NavLink>
        <NavLink href="/templates"><LocalizedText en="Templates" nb="Maler" ar="القوالب" /></NavLink>
        <NavLink href="/pricing"><LocalizedText en="Pricing" /></NavLink>
        <WorkspaceNavLink />
        <LanguageSwitcher />
        <SignOutButton />
      </nav>
    </header>
    <main>{children}</main>
    <footer className="footer"><LocalizedText en="A calm control plane for bounded AI work." /></footer>
  </div>;
}
export function StatusPill({ status }: { status: string }) {
  const label = status === "WAITING" ? <LocalizedText en="Needs input" /> : status === "ACTIVE" ? <LocalizedText en="Active" /> : status === "COMPLETED" ? <LocalizedText en="Completed" /> : status;
  return <span className={`status status-${status.toLowerCase()}`}>{label}</span>;
}
