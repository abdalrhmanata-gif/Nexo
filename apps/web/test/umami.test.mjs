import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  UMAMI_DOMAINS,
  UMAMI_SCRIPT_URL,
  UMAMI_WEBSITE_ID,
  isUmamiHost,
  umamiPageFor,
  umamiPageview,
  umamiReferrerFor,
} from "../lib/umami.mjs";

// Umami is a second, external view of public traffic. Its script is loaded
// from another company, so what reaches it is decided here, in our own code,
// and nothing is sent unless this module says so: the script's own automatic
// tracking is switched off.

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(webRoot, path), "utf8");

test("only the public pages are reported, as a bare path", () => {
  for (const path of ["/", "/pricing", "/templates", "/privacy", "/terms", "/auth/sign-in", "/auth/sign-up", "/auth/forgot-password", "/auth/reset-password"]) {
    assert.equal(umamiPageFor(path), path);
  }
  assert.equal(umamiPageFor("/pricing/"), "/pricing");
});

test("nothing inside the signed-in workspace is ever reported", () => {
  // A mission address carries the mission's id; the workspace is where a
  // person's own work lives. None of it is a third party's business.
  for (const path of ["/app", "/app/business", "/app/opportunities", "/app/analytics", "/app/missions/new", "/app/missions/3f2c9a1e-0000-4000-8000-000000000000", "/app/anything/else"]) {
    assert.equal(umamiPageFor(path), null, path);
  }
});

test("the query string and the fragment never leave the browser", () => {
  // Sign-in links carry tokens there; a search carries what a person typed.
  assert.equal(umamiPageFor("/auth/reset-password?code=secret-token"), "/auth/reset-password");
  assert.equal(umamiPageFor("/auth/sign-in?next=%2Fapp%2Fmissions%2F123"), "/auth/sign-in");
  assert.equal(umamiPageFor("/pricing#access_token=abc"), "/pricing");
});

test("an address that is not a known public page is not reported at all", () => {
  for (const path of ["/api/metrics", "/auth/callback", "/auth/confirm", "/unknown", "/invite/abc123", "", null, undefined, 42]) {
    assert.equal(umamiPageFor(path), null, String(path));
  }
});

test("the referring site is reduced to its origin, and our own pages to nothing", () => {
  assert.equal(umamiReferrerFor("https://www.google.com/search?q=private+words", "zavqera.com"), "https://www.google.com");
  assert.equal(umamiReferrerFor("https://news.example/article/123#part", "zavqera.com"), "https://news.example");
  // Arriving on a public page from inside the workspace must not hand over
  // the workspace address as the referrer.
  assert.equal(umamiReferrerFor("https://zavqera.com/app/missions/3f2c9a1e", "zavqera.com"), "");
  assert.equal(umamiReferrerFor("https://www.zavqera.com/app", "zavqera.com"), "");
  assert.equal(umamiReferrerFor("https://zavqera.com/app", "www.zavqera.com"), "");
  for (const value of ["", null, undefined, "not a url", "javascript:alert(1)", "/relative/path"]) {
    assert.equal(umamiReferrerFor(value, "zavqera.com"), "", String(value));
  }
});

test("only the production site reports; previews and local runs do not", () => {
  assert.deepEqual(UMAMI_DOMAINS, ["zavqera.com", "www.zavqera.com"]);
  assert.equal(isUmamiHost("zavqera.com"), true);
  assert.equal(isUmamiHost("www.zavqera.com"), true);
  for (const host of ["localhost", "deploy-preview-1--unique-kringle-3ce321.netlify.app", "unique-kringle-3ce321.netlify.app", "evil-zavqera.com", "zavqera.com.evil.example", "", null]) {
    assert.equal(isUmamiHost(host), false, String(host));
  }
});

test("a page view carries the address and referrer we chose and nothing we added", () => {
  const base = { website: "w", screen: "1x1", language: "en", title: "Pricing", hostname: "zavqera.com", url: "/pricing?utm=x", referrer: "https://zavqera.com/app/missions/1" };
  const sent = umamiPageview(base, { pathname: "/pricing?utm=x", referrer: "https://www.google.com/search?q=x", hostname: "zavqera.com" });
  assert.deepEqual(sent, { ...base, url: "/pricing", referrer: "https://www.google.com" });
  // Nothing that names a person is ever put in.
  assert.equal("id" in sent, false);
  assert.equal("data" in sent, false);
});

test("a page view that should not be sent is not built", () => {
  const base = { website: "w", url: "/app", referrer: "" };
  assert.equal(umamiPageview(base, { pathname: "/app/opportunities", referrer: "", hostname: "zavqera.com" }), null);
  assert.equal(umamiPageview(base, { pathname: "/pricing", referrer: "", hostname: "localhost" }), null);
});

test("the tracker is loaded once, with its own automatic tracking switched off", () => {
  const component = read("components/umami-analytics.tsx");
  const layout = read("app/layout.tsx");
  assert.match(layout, /<UmamiAnalytics \/>/);
  // The internal counter stays: Umami is an addition, not a replacement.
  assert.match(layout, /<PageMetrics \/>/);
  assert.match(component, /from "next\/script"/);
  assert.match(component, /src=\{UMAMI_SCRIPT_URL\}/);
  assert.match(component, /data-website-id=\{UMAMI_WEBSITE_ID\}/);
  // Off, so that the script sends nothing on its own — no automatic page
  // views on navigation into the workspace, no click tracking.
  assert.match(component, /data-auto-track="false"/);
  assert.match(component, /data-domains=\{UMAMI_DOMAINS\.join\(","\)\}/);
  assert.match(component, /data-do-not-track="true"/);
  assert.match(component, /data-exclude-search="true"/);
  assert.match(component, /data-exclude-hash="true"/);
  assert.equal(UMAMI_SCRIPT_URL, "https://cloud.umami.is/script.js");
  assert.match(UMAMI_WEBSITE_ID, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
});

test("the script is requested only on the production site, and only once a public page is opened", () => {
  // Loading a script is itself a request to another company. Someone who
  // opens the workspace directly, and stays there, never makes it — and
  // neither does a preview build, a local run or the browser test, whose
  // network guard fails on any request that leaves the machine.
  const component = read("components/umami-analytics.tsx");
  assert.match(component, /useState\(false\)/, "nothing is rendered until the browser has checked where it is");
  assert.match(component, /if \(isUmamiHost\(window\.location\.hostname\) && umamiPageFor\(pathname\) !== null\) setWanted\(true\);/);
  assert.match(component, /if \(!wanted\) return null;/);
});

test("the tracker is never told who the visitor is", () => {
  const component = read("components/umami-analytics.tsx")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n").map((line) => line.replace(/\s*\/\/.*$/, "")).join("\n");
  assert.doesNotMatch(component, /identify\s*\(/, "identify() attaches an id to the session");
  assert.doesNotMatch(component, /supabase|getUser|email|user_id|userId|session/i);
  assert.doesNotMatch(component, /localStorage|sessionStorage|document\.cookie/);
  // Every page view goes through the one function that decides what is sent.
  assert.match(component, /umamiPageview\(/);
  assert.equal((component.match(/\.track\(/g) ?? []).length, 1, "one call site, so one place to audit");
});

test("the Umami script is loaded from one file only", () => {
  const offenders = ["app/layout.tsx", "components/shell.tsx", "components/page-metrics.tsx", "app/page.tsx"]
    .filter((path) => /umami\.is|script\.js/.test(read(path)));
  assert.deepEqual(offenders, []);
});

test("the analytics link is in the menu only for the people who run the site", () => {
  const shell = read("components/shell.tsx");
  const layout = read("app/layout.tsx");
  // The link is a convenience. What keeps the figures private is the database
  // function behind the page; the menu merely does not advertise a page that
  // would turn a customer away.
  assert.match(shell, /\{siteOperator && <NavLink className="nav-link nav-analytics" href="\/app\/analytics">/);
  assert.match(shell, /siteOperator = false/, "hidden unless the layout says otherwise");
  assert.match(shell, /\.rpc\("is_site_operator"\)/);
  assert.match(shell, /return data === true;/, "anything but a plain yes — an error, a missing function — hides the link");
  assert.match(layout, /const \[siteOperator, sharedWorkspace, account\] = signedIn\s+\? await Promise\.all\(\[readSiteOperator\(\), readOpenSharedWorkspace\(\), readAccountSummary\(\)\]\)\s+: \[false, null, null\];/, "a visitor who is not signed in is never asked about");
  assert.match(layout, /<Shell signedIn=\{signedIn\} siteOperator=\{siteOperator\}/);
});
