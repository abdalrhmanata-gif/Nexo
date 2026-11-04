"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LocalizedText } from "./localized-text";

export function NavLink({
  href,
  children,
  prefix,
  className = "",
}: {
  href: string;
  children: React.ReactNode;
  prefix?: string;
  className?: string;
}) {
  const pathname = usePathname();
  const isCurrent = prefix ? pathname === prefix || pathname.startsWith(`${prefix}/`) : pathname === href;
  return (
    <Link href={href} prefetch={false} className={className} aria-current={isCurrent ? "page" : undefined}>
      {children}
    </Link>
  );
}

export function WorkspaceNavLink() {
  return (
    <NavLink href="/app" className="nav-link workspace-nav">
      <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3h8v8H3zM13 3h8v5h-8zM13 10h8v11h-8zM3 13h8v8H3z" /></svg>
      <LocalizedText en="Workspace" nb="Arbeidsområde" ar="مساحة العمل" />
    </NavLink>
  );
}
