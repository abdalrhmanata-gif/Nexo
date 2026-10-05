import Link from "next/link";
import { SignOutButton } from "./auth-form";
import { LanguageSwitcher } from "./language-switcher";
import { LocalizedText } from "./localized-text";

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="site-shell">
      <header className="topbar">
        <Link className="brand" href="/">
          ZAVQERA <span><LocalizedText en="MISSION CONTROL" /></span>
        </Link>
        <nav aria-label="Primary navigation">
          <Link href="/pricing"><LocalizedText en="Pricing" /></Link>
          <Link href="/app"><LocalizedText en="Workspace" /></Link>
          <Link className="button button-small" href="/app/missions/new"><LocalizedText en="New mission" /></Link>
          <LanguageSwitcher />
          <SignOutButton />
        </nav>
      </header>
      <main>{children}</main>
      <footer className="footer"><LocalizedText en="A calm control plane for bounded AI work." /></footer>
    </div>
  );
}

export function StatusPill({ status }: { status: string }) {
  const label = status === "WAITING" ? <LocalizedText en="Needs input" /> : status === "ACTIVE" ? <LocalizedText en="Active" /> : status === "COMPLETED" ? <LocalizedText en="Completed" /> : status;
  return <span className={`status status-${status.toLowerCase()}`}>{label}</span>;
}
