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
    <Link href={href} className={className} aria-current={isCurrent ? "page" : undefined}>
      {children}
    </Link>
  );
}

export function WorkspaceNavLink() {
  return (
    <NavLink href="/app" prefix="/app" className="button button-small workspace-nav">
      <LocalizedText en="Workspace" />
    </NavLink>
  );
}
