"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { UMAMI_DOMAINS, UMAMI_SCRIPT_URL, UMAMI_WEBSITE_ID, isUmamiHost, umamiPageFor, umamiPageview, type UmamiPayload } from "../lib/umami.mjs";

// Umami Cloud, beside our own page counter and not instead of it.
//
// The script is told to track nothing by itself (data-auto-track="false"), so
// it does not follow navigation into the workspace and does not watch clicks.
// The only thing it ever sends is the page view built here, and
// lib/umami.mjs builds one only for a known public page on the production
// site: a bare path, the referring site's origin, and what the script itself
// reads (screen size, language, page title). The visitor is never named to
// it. If the script is blocked or fails to load, nothing happens.
//
// Loading the script is itself a request to another company, so it is
// requested only on the production site and only once a public page is
// opened. Someone who opens the workspace directly, and stays there, never
// makes it; neither does a preview build, a local run or the browser test.
// The hostname is known only in the browser, so nothing is rendered until an
// effect has looked.

type UmamiTracker = { track: (build: (payload: UmamiPayload) => UmamiPayload) => unknown };

export function UmamiAnalytics() {
  const pathname = usePathname();
  const current = useRef(pathname);
  const reported = useRef("");
  const first = useRef(true);
  const [wanted, setWanted] = useState(false);
  current.current = pathname;

  const report = useCallback(() => {
    const tracker = (window as unknown as { umami?: UmamiTracker }).umami;
    const page = current.current;
    if (!tracker || !page || reported.current === page) return;
    const context = {
      pathname: page,
      // Only the first view of a visit has an outside referrer; after that the
      // visitor is moving between our own pages.
      referrer: first.current ? document.referrer : "",
      hostname: window.location.hostname,
    };
    reported.current = page;
    first.current = false;
    if (!umamiPageview({}, context)) return;
    try {
      void Promise.resolve(tracker.track((payload) => umamiPageview(payload, context) as UmamiPayload)).catch(() => {});
    } catch {
      // Analytics must never be the reason a page fails.
    }
  }, []);

  useEffect(() => {
    if (isUmamiHost(window.location.hostname) && umamiPageFor(pathname) !== null) setWanted(true);
    report();
  }, [pathname, report]);

  if (!wanted) return null;

  return (
    <Script
      src={UMAMI_SCRIPT_URL}
      strategy="afterInteractive"
      data-website-id={UMAMI_WEBSITE_ID}
      data-auto-track="false"
      data-domains={UMAMI_DOMAINS.join(",")}
      data-do-not-track="true"
      data-exclude-search="true"
      data-exclude-hash="true"
      onLoad={report}
    />
  );
}
