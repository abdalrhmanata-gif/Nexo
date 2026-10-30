"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";

const NotificationBell = dynamic(
  () => import("./notification-bell").then((module) => module.NotificationBell),
  { ssr: false },
);
const SignOutButton = dynamic(
  () => import("./sign-out-button").then((module) => module.SignOutButton),
  { ssr: false },
);

export function WorkspaceNavActions() {
  const pathname = usePathname();
  const isWorkspaceRoute = pathname === "/app" || pathname.startsWith("/app/");

  if (!isWorkspaceRoute) return null;

  return (
    <>
      <NotificationBell />
      <SignOutButton />
    </>
  );
}
