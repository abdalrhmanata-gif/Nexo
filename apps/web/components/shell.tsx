import Link from "next/link";
import { SignOutButton } from "./auth-form";

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="site-shell">
      <header className="topbar">
        <Link className="brand" href="/">
          ZAVQERA <span>MISSION CONTROL</span>
        </Link>
        <nav aria-label="Primary navigation">
          <Link href="/app">Workspace</Link>
          <Link className="button button-small" href="/app/missions/new">New mission</Link>
          <SignOutButton />
        </nav>
      </header>
      <main>{children}</main>
      <footer className="footer">A calm control plane for bounded AI work.</footer>
    </div>
  );
}

export function StatusPill({ status }: { status: string }) {
  return <span className={`status status-${status.toLowerCase()}`}>{status === "WAITING" ? "Needs input" : status}</span>;
}
