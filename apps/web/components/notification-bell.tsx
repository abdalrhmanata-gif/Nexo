"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LocalizedText } from "./localized-text";

export function NotificationBell() {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let mounted = true;
    const refresh = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const response = await fetch("/api/notifications", { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json() as { count?: unknown };
        if (mounted && typeof data.count === "number" && Number.isFinite(data.count)) {
          setCount(Math.max(0, data.count));
        }
      } catch {
        // Keep the navigation usable when the notification endpoint is unavailable.
      }
    };
    const refreshWhenVisible = () => { void refresh(); };

    void refresh();
    const interval = window.setInterval(refreshWhenVisible, 60000);
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      mounted = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, []);

  return <Link href="/app/notifications" className="notification-bell" aria-label={count === null ? "Notifications" : "Notifications, " + count + " items need attention"} title="Notifications">
    <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
      <path d="M10 21h4" />
    </svg>
    <span className="notification-label"><LocalizedText en="Notifications" nb="Varsler" ar="الإشعارات" /></span>
    {count !== null && count > 0 && <span className="notification-count" aria-hidden="true">{count > 99 ? "99+" : count}</span>}
  </Link>;
}
