import Link from "next/link";
import { SignOutButton } from "./auth-form";
import { LanguageSwitcher } from "./language-switcher";
import { LocalizedFill, LocalizedText } from "./localized-text";
import { NavLink, WorkspaceNavLink } from "./nav-link";
import { NotificationBell } from "./notification-bell";
import { BrandMark } from "./brand-mark";
import { MobileNavToggle } from "./mobile-nav-toggle";
import { cache } from "react";
import { PLAN_LIMITS } from "../lib/billing-plans.mjs";
import { ThemeSwitcher } from "./theme-switcher";
import { isSupabaseConfigured } from "../lib/supabase/config";
import { createSupabaseServerClient, getAuthenticatedUser, readBillingOverview } from "../lib/supabase/server";

function NavIcon({ name }: { name: "search" | "plus" | "business" | "templates" | "pricing" | "workspace" | "opportunities" | "analytics" | "calendar" | "assistant" }) {
  const common = { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true as const };
  switch (name) {
    case "search": return <svg {...common}><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.5 4.5" /></svg>;
    case "plus": return <svg {...common}><path d="M12 5v14M5 12h14" /></svg>;
    case "business": return <svg {...common}><rect x="3" y="7" width="18" height="14" rx="2" /><path d="M8 7V4h8v3M7 12h.01M12 12h.01M17 12h.01M7 16h.01M12 16h.01M17 16h.01" /></svg>;
    case "templates": return <svg {...common}><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></svg>;
    case "calendar": return <svg {...common}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>;
    case "pricing": return <svg {...common}><path d="M12 3v18M17 7.5c0-1.7-2.1-3-5-3s-5 1.2-5 3 1.7 2.6 5 3 5 1.3 5 3.1-2 3.4-5 3.4-5-1.3-5-3" /></svg>;
    case "workspace": return <svg {...common}><path d="M3 3h8v8H3zM13 3h8v5h-8zM13 10h8v11h-8zM3 13h8v8H3z" /></svg>;
    case "opportunities": return <svg {...common}><path d="M4 19V12M10 19V5M16 19V9M22 19V3" /></svg>;
    case "analytics": return <svg {...common}><path d="M3 3v18h18M7 15l4-5 3 3 5-7" /></svg>;
    case "assistant": return <svg {...common}><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" /><path d="M18 15l.8 2.2L21 18l-2.2.8L18 21l-.8-2.2L15 18l2.2-.8z" /></svg>;
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
// One auth round trip per request, shared by everything the header reads.
const readCurrentUser = cache(async () => {
  if (!isSupabaseConfigured()) return null;
  try {
    // The same cached read the page and its repositories use.
    return await getAuthenticatedUser();
  } catch {
    // Treat an unreadable session as signed out rather than failing the page.
    return null;
  }
});

export async function readSignedIn(): Promise<boolean> {
  return Boolean(await readCurrentUser());
}

export type AccountSummary = { email: string; name: string | null; plan: string; used: number; limit: number };

/**
 * Who is signed in and how much AI they have left this month, for the
 * account menu. Anything unreadable leaves the menu with just the email and
 * the Free allowance rather than failing the page.
 */
export async function readAccountSummary(): Promise<AccountSummary | null> {
  const user = await readCurrentUser();
  if (!user?.email) return null;
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const rawName = typeof meta.full_name === "string" ? meta.full_name : typeof meta.name === "string" ? meta.name : "";
  const summary: AccountSummary = { email: user.email, name: rawName.trim() || null, plan: "free", used: 0, limit: PLAN_LIMITS.free };
  try {
    const row = await readBillingOverview();
    if (row) {
      summary.plan = row.plan ?? "free";
      summary.used = row.generations_used ?? 0;
      summary.limit = row.monthly_limit ?? PLAN_LIMITS.free;
    }
  } catch {
    // Keep the defaults.
  }
  return summary;
}

const PLAN_LABELS: Record<string, string> = { free: "Free", plus: "Plus", pro: "Pro", scale: "Scale" };

function AccountMenu({ account, billing, siteOperator }: { account: AccountSummary; billing: boolean; siteOperator: boolean }) {
  const display = account.name ?? account.email.split("@")[0];
  const left = Math.max(account.limit - account.used, 0);
  return (
    <details className="account-menu">
      <summary className="account-trigger">
        <span className="account-avatar" aria-hidden="true">{display.slice(0, 1).toUpperCase()}</span>
        <span className="account-trigger-name">{display}</span>
        <span className="visually-hidden"><LocalizedText en="Account" /></span>
      </summary>
      <div className="account-panel">
        <p className="account-identity">
          {account.name && <strong>{account.name}</strong>}
          <span>{account.email}</span>
        </p>
        <div className="account-usage">
          <span className="account-plan"><LocalizedText en={PLAN_LABELS[account.plan] ?? "Free"} /></span>
          <span><LocalizedFill en="{left} of {limit} AI drafts left this month" values={{ left, limit: account.limit }} /></span>
          <span className="account-meter" aria-hidden="true"><i style={{ width: `${account.limit ? Math.min(100, (left / account.limit) * 100) : 0}%` }} /></span>
        </div>
        <div className="account-links">
          {billing && <NavLink className="nav-link nav-billing" href="/app/billing"><NavIcon name="pricing" /><LocalizedText en="Billing" /></NavLink>}
          <NavLink className="nav-link nav-own-templates" href="/app/templates"><NavIcon name="templates" /><LocalizedText en="Your templates" /></NavLink>
          <NavLink className="nav-link nav-calendar" href="/app/calendar"><NavIcon name="calendar" /><LocalizedText en="Your calendar" /></NavLink>
          <NavLink className="nav-link nav-connections" href="/app/connections"><NavIcon name="assistant" /><LocalizedText en="Connected AI apps" /></NavLink>
          <NavLink className="nav-link nav-team" href="/app/team"><NavIcon name="workspace" /><LocalizedText en="Team" /></NavLink>
          {siteOperator && <NavLink className="nav-link nav-analytics" href="/app/analytics"><NavIcon name="analytics" /><LocalizedText en="Website analytics" /></NavLink>}
        </div>
        <SignOutButton />
      </div>
    </details>
  );
}

/**
 * Whether the signed-in account is one of the people who run the site. Only
 * decides whether the menu offers the analytics page; the page's data is
 * guarded in the database whatever this returns. Anything but a plain yes —
 * an error, a database that does not have the function yet — hides the link.
 */
export async function readSiteOperator(): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.rpc("is_site_operator");
    return data === true;
  } catch {
    return false;
  }
}

export function Shell({ children, signedIn = false, siteOperator = false, billing = false, sharedWorkspace = null, account = null, navLabel = "Primary navigation", guidesHref = "/guides" }: { children: React.ReactNode; signedIn?: boolean; siteOperator?: boolean; billing?: boolean; sharedWorkspace?: { ownerEmail: string; role: string } | null; account?: AccountSummary | null; navLabel?: string; guidesHref?: string }) {
  return (
    <div className="site-shell">
      <header className="topbar">
        <Link className="brand" href="/" prefetch={false}>
          <BrandMark />
          <span className="brand-wordmark">ZAVQERA</span>
          <span className="brand-subtitle"><LocalizedText en="TEAM CHECKLISTS" /></span>
          <span className="visually-hidden"><LocalizedText en="Home" /></span>
        </Link>
        <MobileNavToggle />
        <nav id="primary-nav" className="primary-nav" aria-label={navLabel}>
          {/* The whole product is on show to a first-time visitor, because a
              half-empty header makes the product look smaller than it is. The
              workspace links still need a session, so for a signed-out visitor
              they carry ?next= and the sign-in page names where they were
              heading, instead of dropping them on an unexplained form. */}
          <Link className="nav-link nav-search" href={signedIn ? "/app#mission-search" : "/auth/sign-in?next=%2Fapp"} prefetch={false}><NavIcon name="search" /><LocalizedText en="Search" /></Link>
          <Link className="nav-link nav-new-mission" href={signedIn ? "/app/missions/new" : "/auth/sign-in?next=%2Fapp%2Fmissions%2Fnew"} prefetch={false}><NavIcon name="plus" /><LocalizedText en="New mission" /></Link>
          <NavLink className="nav-link nav-business" href={signedIn ? "/app/business" : "/auth/sign-in?next=%2Fapp%2Fbusiness"}><NavIcon name="business" /><LocalizedText en="Business" /></NavLink>
          <NavLink className="nav-link nav-templates" href="/templates"><NavIcon name="templates" /><LocalizedText en="Templates" /></NavLink>
          <NavLink className="nav-link nav-pricing" href="/pricing"><NavIcon name="pricing" /><LocalizedText en="Pricing" /></NavLink>
          {signedIn
            ? <WorkspaceNavLink />
            : <Link className="nav-link workspace-nav" href="/auth/sign-in?next=%2Fapp" prefetch={false}><NavIcon name="workspace" /><LocalizedText en="Workspace" /></Link>}
          <NavLink href={signedIn ? "/app/opportunities" : "/auth/sign-in?next=%2Fapp%2Fopportunities"} className="nav-link nav-opportunities"><NavIcon name="opportunities" /><LocalizedText en="Opportunity Intelligence" /></NavLink>
          {signedIn && <NotificationBell />}
          <LanguageSwitcher />
          <ThemeSwitcher />
          {signedIn
            ? (account ? <AccountMenu account={account} billing={billing} siteOperator={siteOperator} /> : <SignOutButton />)
            : <>
              <Link className="nav-link nav-sign-in" href="/auth/sign-in"><LocalizedText en="Sign in" /></Link>
              <Link className="button button-small nav-start-free" href="/auth/sign-up"><LocalizedText en="Start free" /></Link>
            </>}
        </nav>
      </header>
      {/* Someone who accepted an invitation sees another person's missions in
          place of their own. Without this band that reads as their own work
          having gone. */}
      {sharedWorkspace && <div className="shared-workspace-band" role="status">
        <span><LocalizedFill en="You are in the workspace shared by {email}." values={{ email: sharedWorkspace.ownerEmail }} />{sharedWorkspace.role === "viewer" && <> <LocalizedText en="You can view it but not change it." /></>}</span>
        <Link href="/app/team" prefetch={false}><LocalizedText en="Switch workspace" /></Link>
      </div>}
      <main>{children}</main>
      <footer className="footer">
        <span><LocalizedText en="Checklists for small teams, with an owner and proof on every step." /></span>
        {/* Reachable from every page, which is what makes them findable at the
            moment someone wants them: before they sign up. */}
        <span className="footer-links">
          <Link href={guidesHref} prefetch={false}><LocalizedText en="Guides" /></Link>
          <Link href="/checklists" prefetch={false}><LocalizedText en="Checklists" /></Link>
          <Link href="/ai" prefetch={false}><LocalizedText en="AI assistants" /></Link>
          <Link href="/privacy" prefetch={false}><LocalizedText en="Privacy" /></Link>
          <Link href="/terms" prefetch={false}><LocalizedText en="Terms" /></Link>
        </span>
      </footer>
    </div>
  );
}

export function StatusPill({ status, label: shown }: { status: string; label?: string }) {
  // This pill describes one mission, so Norwegian wants the singular "Aktiv".
  // The metric cards count missions and want "Aktive". Same English word, two
  // Norwegian ones, so the key carries its context; see translate().
  const label = status === "WAITING" ? <LocalizedText en="Needs input" />
    : status === "ACTIVE" ? <LocalizedText en="Active|one mission" />
    : status === "COMPLETED" ? <LocalizedText en="Completed|one mission" />
    : status;
  // A mission page passes its exact lifecycle state ("Draft", "Checking the
  // evidence"); lists keep the three broad groups.
  return <span className={`status status-${status.toLowerCase()}`}>{shown ?? label}</span>;
}
