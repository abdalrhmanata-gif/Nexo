"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

// Reports that a page was opened. It writes nothing to the device — no cookie,
// no localStorage, no identifier — which is the whole reason this product
// needs no consent banner. If the request fails, or an extension blocks it,
// nothing visible happens: a counter is never worth a broken page.

export function PageMetrics() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname) return;
    const body = JSON.stringify({ path: pathname, referrer: document.referrer || "" });
    try {
      // sendBeacon survives the page being closed straight away, which is
      // exactly the visit a landing page most needs to count.
      if (navigator.sendBeacon?.("/api/metrics", new Blob([body], { type: "application/json" }))) return;
    } catch {
      // Fall through to fetch.
    }
    void fetch("/api/metrics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  }, [pathname]);

  return null;
}
