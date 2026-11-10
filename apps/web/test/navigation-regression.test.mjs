import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, resolve } from "node:path";
import test from "node:test";
import { duplicateKeys, readDictionaries } from "./helpers/dictionaries.mjs";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(webRoot, path), "utf8");

test("global navigation and auth cross-links do not prefetch unopened pages", () => {
  const shell = read("components/shell.tsx");
  assert.match(shell, /<Link className="brand" href="\/" prefetch=\{false\}>/);
  // The workspace links take a conditional href so a signed-out visitor is
  // sent to sign-in with ?next= instead of a silent bounce, so assert the
  // invariant — every Link mentioning these routes opts out of prefetch —
  // rather than a literal attribute order.
  for (const route of ["/app#mission-search", "/app/missions/new"]) {
    const link = shell.split("\n").find((line) => line.includes(route) && line.includes("<Link"));
    assert.ok(link, `no Link found for ${route}`);
    assert.ok(link.includes("prefetch={false}"), `${route} must not prefetch`);
  }
  const nav = read("components/nav-link.tsx");
  assert.match(nav, /<Link href=\{href\} prefetch=\{false\}/);
  const signIn = read("app/auth/sign-in/page.tsx");
  assert.match(signIn, /<Link href="\/auth\/sign-up" prefetch=\{false\}>/);
});

test("primary navigation restores the key destinations and keeps Opportunity Intelligence", () => {
  const shell = read("components/shell.tsx");
  for (const label of ["Search", "New mission", "Business", "Templates", "Pricing", "Opportunity Intelligence"]) {
    assert.ok(shell.includes(`en="${label}"`), `missing ${label} from primary navigation`);
  }
  for (const route of ["/app#mission-search", "/app/missions/new", "/app/business", "/templates", "/pricing", "/app/opportunities"]) {
    assert.ok(shell.includes(route), `missing navigation route ${route}`);
  }
  assert.ok(shell.includes("<NotificationBell />"));
  assert.ok(shell.includes("<SignOutButton />"));
  assert.ok(!shell.includes("WorkspaceNavActions"));
  assert.match(shell, /<LanguageSwitcher\s*\/>/);
});

test("every restored navigation route has a page or its parent destination", () => {
  const required = [
    "app/app/page.tsx",
    "app/app/business/page.tsx",
    "app/app/opportunities/page.tsx",
    "app/app/notifications/page.tsx",
    "app/app/missions/new/page.tsx",
    "app/templates/page.tsx",
    "app/pricing/page.tsx",
  ];
  for (const path of required) assert.equal(existsSync(join(webRoot, path)), true, `missing route file: ${path}`);
});

test("workspace search filters the visible missions and preserves status filters", () => {
  const page = read("app/app/page.tsx");
  assert.match(page, /id="mission-search"/);
  assert.match(page, /name="q"/);
  assert.match(page, /normalizedQuery/);
  assert.match(page, /mission\.name, mission\.intent, \.\.\.mission\.criteria/);
  assert.match(page, /encodeURIComponent\(query\)/);
});

test("language control supports English, Norwegian, Arabic, and right-to-left direction", () => {
  const language = read("components/language-switcher.tsx");
  assert.match(language, /"en", "nb", "ar"/);
  assert.match(language, /document\.documentElement\.dir = language === "ar" \? "rtl" : "ltr"/);
  assert.match(language, /localStorage\.setItem/);
});

test("notification badge follows the signed-in header everywhere and pauses in hidden tabs", () => {
  const bell = read("components/notification-bell.tsx");
  const shell = read("components/shell.tsx");
  const endpoint = read("app/api/notifications/route.ts");
  // The badge is no longer scoped to /app: a signed-in user reading pricing or
  // templates could not see that anything needed them. Shell still renders it
  // only when signed in, which is what keeps it off public pages.
  assert.ok(!bell.includes("usePathname"), "the badge must not re-introduce route scoping");
  assert.ok(!bell.includes("isWorkspaceRoute"), "the badge must not re-introduce route scoping");
  assert.ok(shell.includes("{signedIn && <NotificationBell />}"), "the badge stays behind the session");
  assert.ok(endpoint.includes("unplanned"), "a mission with no actions must count as needing attention");
  assert.ok(shell.includes("<SignOutButton />"));
  assert.ok(bell.includes('if (document.visibilityState !== "visible") return;'));
  assert.ok(bell.includes('document.addEventListener("visibilitychange"'));
  assert.ok(bell.includes('document.removeEventListener("visibilitychange"'));
  assert.ok(bell.includes('fetch("/api/notifications"'));
  assert.ok(endpoint.includes("createSupabaseMissionRepository"));
  assert.ok(endpoint.includes("repository.listMissions()"));
  assert.ok(endpoint.includes("Cache-Control"));
});

test("Supabase browser SDK is loaded only when the user submits an auth action", () => {
  const auth = read("components/auth-form.tsx");
  assert.ok(!auth.includes('import { createSupabaseBrowserClient } from "../lib/supabase/browser"'));
  // Assert the invariant rather than a fixed count: the client must never be
  // constructed without a dynamic import first, however many auth forms the
  // file grows. A static import would pull the SDK into the initial bundle.
  const dynamicImports = auth.split('await import("../lib/supabase/browser")').length - 1;
  const clientUses = auth.split("createSupabaseBrowserClient()").length - 1;
  assert.ok(dynamicImports >= 2, "expected the SDK to be imported lazily per auth action");
  assert.equal(dynamicImports, clientUses, "every client construction needs its own lazy import");
  assert.ok(auth.includes("async function submit"));
  assert.ok(auth.includes("async function signOut"));
});

test("business workspace emphasizes useful actions and is transparent about unavailable team features", () => {
  const page = read("app/app/business/page.tsx");
  assert.match(page, /Team collaboration is in development/);
  assert.match(page, /Secure invitations, team roles, and shared business access are not enabled yet/);
  for (const route of ["/app/missions/new", "/templates", "/app/opportunities", "/app/notifications"]) {
    assert.ok(page.includes(route), `missing business quick action ${route}`);
  }
  assert.match(page, /business-focus/);
  assert.match(page, /business-metrics/);
  assert.doesNotMatch(page, /<button[^>]*disabled/);
  assert.doesNotMatch(page, /No invitation is sent/);
});

test("workspace provides total mission count and useful quick-start routes", () => {
  const page = read("app/app/page.tsx");
  assert.match(page, /All missions/);
  assert.match(page, /workspace-quick-actions/);
  for (const route of ["/app/missions/new", "/templates", "/app/opportunities"]) {
    assert.ok(page.includes(route), `missing workspace shortcut ${route}`);
  }
});

test("mission mutations refresh app-router data without a full-page reload", () => {
  for (const path of [
    "components/add-action-form.tsx",
    "components/action-mutation-controls.tsx",
    "components/mission-mutation-controls.tsx",
    "components/verification-controls.tsx",
  ]) {
    const component = read(path);
    assert.match(component, /router\.refresh\(\)/, `${path} must refresh the in-app view`);
    assert.doesNotMatch(component, /window\.location\.reload\(\)/, `${path} must not force a full reload`);
    assert.match(component, /catch/, `${path} must handle network failures`);
  }
});

test("navigation identifies Workspace only on the workspace route", () => {
  const nav = read("components/nav-link.tsx");
  assert.match(nav, /NavLink href="\/app" className="nav-link workspace-nav"/);
  assert.doesNotMatch(nav, /WorkspaceNavLink[\s\S]{0,250}prefix="\/app"/);
});

test("landing page explains real product value and uses functional paths", () => {
  const page = read("app/page.tsx");
  for (const route of ["/app", "/app/opportunities", "/templates", "/pricing"]) {
    assert.ok(page.includes(route), `missing landing CTA ${route}`);
  }
  assert.match(page, /Review before action/);
  assert.match(page, /Illustrative view/);
});

test("brand link exposes its visible label and landing proof badges meet AA contrast", () => {
  const shell = read("components/shell.tsx");
  assert.match(shell, /<Link className="brand" href="\/" prefetch=\{false\}>/);
  assert.doesNotMatch(shell, /aria-label="Zavqera home"/);
  assert.match(shell, /className="visually-hidden"/);
  // The label used to carry its Norwegian and Arabic inline. Those props are
  // gone — they covered two of five languages and left the rest in English —
  // so the assertion is now that the label is there and wrapped. That it
  // resolves in every language is enforced for the whole app by
  // test/i18n-key-resolution.test.mjs.
  assert.match(shell, /<LocalizedText en="Home"\s*\/>/);
  assert.doesNotMatch(shell, /<LocalizedText[^>]*\snb="/,
    "inline nb/ar are a second source of truth; the dictionary is the only path");
  const css = read("app/globals.css");
  assert.match(css, /\.topbar \.brand \.visually-hidden \{ display:block; \}/);
  assert.match(css, /\.landing-proof-icon \{[^}]*background:#e3f5f0; color:#08685f;/);
});

test("templates prefill the normal review-before-create mission flow", () => {
  const templates = read("app/templates/page.tsx");
  const missionForm = read("app/app/missions/new/page.tsx");
  assert.match(templates, /new URLSearchParams/);
  for (const field of ["name", "intent", "criteria", "actions"]) {
    assert.match(templates, new RegExp(field));
    assert.match(missionForm, new RegExp(`params\\.${field}`));
  }
  assert.match(templates, /Nothing is created until you review/);
});

test("every .mjs module imported from TypeScript has a .d.mts declaration", () => {
  // tsconfig sets allowJs:false with strict:true, so importing an .mjs module
  // from a .ts/.tsx file fails typecheck (TS7016) unless a declaration sits
  // beside it. The unit suite happily passes without one, so only CI caught
  // it — this test moves that failure back to the local run. A .mjs module
  // that only other .mjs files import needs no declaration, so the check
  // follows the imports rather than the directory.
  const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.name === "node_modules" || entry.name === ".next") return [];
    return entry.isDirectory() ? walk(full) : [full];
  });
  const sources = walk(webRoot).filter((file) => file.endsWith(".ts") || file.endsWith(".tsx"));
  const missing = [];
  for (const file of sources) {
    const body = readFileSync(file, "utf8");
    for (const match of body.matchAll(/from "([^"]+\.mjs)"/g)) {
      const target = resolve(dirname(file), match[1]);
      const declaration = target.replace(/\.mjs$/, ".d.mts");
      if (!existsSync(declaration)) missing.push(`${relative(webRoot, file)} -> ${match[1]}`);
    }
  }
  assert.deepEqual(missing, [], "these .mjs imports have no .d.mts declaration, so tsc will fail");
});

test("every category the badge counts is a category the notifications page explains", () => {
  // The badge and the page are two readings of the same question. When the
  // badge learned to count missions with no work, the page still showed only
  // "waiting" and "due" — so a user would have seen a number with nothing
  // behind it, which is the exact complaint this product keeps earning.
  const endpoint = read("app/api/notifications/route.ts");
  const page = read("app/app/notifications/page.tsx");
  const counted = endpoint.match(/const (waiting|followUps|unplanned) =/g) ?? [];
  assert.ok(counted.length >= 3, "expected the badge to count at least three categories");
  for (const name of ["waiting", "followUps", "unplanned"]) {
    assert.ok(endpoint.includes(`const ${name} =`), `badge no longer counts ${name}`);
    assert.ok(page.includes(`${name}.length`), `the page does not account for ${name}`);
  }
});

test("privacy and terms exist, are reachable from every page, and say what the code does", () => {
  // A product that collects email addresses and user content from the EEA
  // needs these before launch, and they need to be findable before sign-up —
  // which means the footer, not a page only account holders ever see.
  const shell = read("components/shell.tsx");
  assert.ok(shell.includes('href="/privacy"'), "the footer must link to the privacy notice");
  assert.ok(shell.includes('href="/terms"'), "the footer must link to the terms");
  assert.equal(existsSync(join(webRoot, "app/privacy/page.tsx")), true);
  assert.equal(existsSync(join(webRoot, "app/terms/page.tsx")), true);

  // The notice draws its company and processor facts from lib/legal.ts, so the
  // claims are checked across both rather than against one file's wording.
  const privacy = read("app/privacy/page.tsx") + read("lib/legal.ts");
  // Each of these is a fact the reader can check against this repository.
  // If one stops being true, the notice has to change with it.
  assert.match(privacy, /zavqera\.opportunity-intelligence\.v1/, "names the browser key it claims never leaves the device");
  assert.match(privacy, /zavqera-language/, "names the preference cookies it sets");
  assert.match(privacy, /zavqera-theme/);
  assert.match(privacy, /eu-west-1/, "names the region the database actually runs in");
  assert.match(privacy, /Datatilsynet/, "names the supervisory authority for a Norwegian controller");
  assert.match(privacy, /Article 6\(1\)\(b\)/, "states a legal basis per purpose, not one blanket justification");
  assert.match(privacy, /Article 6\(1\)\(f\)/);
  assert.match(privacy, /Netlify/, "names every processor, as Article 13(1)(e) requires");
  assert.match(privacy, /Supabase/);

  const terms = read("app/terms/page.tsx");
  assert.match(terms, /None of it is legal, financial, medical, immigration[^.]*professional advice/i,
    "the product proposes steps for regulated activities; this clause is the one that must not go missing");
});

test("the privacy notice's claim of no analytics is true of the code", () => {
  const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === "node_modules" || entry.name === ".next") return [];
    const full = join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
  const sources = walk(join(webRoot, "app"))
    .concat(walk(join(webRoot, "components")), walk(join(webRoot, "lib")))
    .filter((file) => /\.(ts|tsx|mjs)$/.test(file));
  const trackers = /googletagmanager|google-analytics|gtag\(|posthog|mixpanel|segment\.com|hotjar|fullstory|plausible|amplitude/i;
  const offenders = sources.filter((file) => trackers.test(readFileSync(file, "utf8")));
  assert.deepEqual(offenders.map((file) => relative(webRoot, file)), [],
    "the privacy notice promises no analytics; adding one means changing the notice too");
});

test("the page counter stores nothing that could identify a visitor", () => {
  // The privacy notice says there is no identifier, no IP and nothing written
  // to the device. These are the places that promise could quietly break.
  const route = read("app/api/metrics/route.ts");
  const beacon = read("components/page-metrics.tsx");
  const migration = readFileSync(
    join(webRoot, "../../supabase/migrations/20261106090000_page_metrics_cookieless_counter.sql"), "utf8");

  // Comments in these files describe what is deliberately absent, so they must
  // be stripped before searching — otherwise the test fails on its own subject.
  const code = (source) => source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n")
    .map((line) => line.replace(/\s*(\/\/|--).*$/, ""))
    .join("\n");

  for (const source of [route, beacon, migration]) {
    assert.doesNotMatch(code(source), /localStorage|sessionStorage|document\.cookie/,
      "the counter must not touch the visitor's device, or it needs a consent banner");
    assert.doesNotMatch(code(source), /x-forwarded-for|\bip_address\b|user[_-]?agent/i,
      "the counter must not record anything about who the visitor is");
  }
  assert.match(migration, /enable row level security/, "the table must deny by default");
  assert.match(migration, /revoke all on table public\.page_metrics from anon, authenticated/,
    "no one reads this table through the API");
  assert.match(route, /normaliseRoute/, "paths must be reduced to a fixed set before they reach the database");
});

test("verification is filled in from the mission instead of asked for again", () => {
  // It used to open two empty boxes and ask the person to retype, from memory,
  // the success criteria written a few centimetres up the same page.
  const controls = read("components/verification-controls.tsx");
  const page = read("app/app/missions/[id]/page.tsx");
  assert.match(controls, /defaultValue=\{criteria\.join\("\\n"\)\}/, "criteria must be prefilled from the mission");
  assert.match(controls, /completedSteps/, "finished steps must be offered as citable evidence");
  assert.ok(controls.includes("const citeStep = (step: string)"), "the cite handler must be typed, or tsc fails");
  for (const prop of ["criteria={mission.criteria}", "completedSteps={completedSteps}"]) {
    assert.ok(page.includes(prop), `the page must pass ${prop} to verification`);
  }
  assert.match(page, /action\.status === "COMPLETED"/, "citable evidence comes from completed steps only");
});

test("the legal pages announce themselves as unfinished while placeholders remain", () => {
  // Both pages are published the moment the site is. A visitor who finds
  // "[CONTROLLER NAME — replace before launch]" sitting in a sentence reads a
  // broken page; the banner makes it an unfinished one, which is the truth.
  const legal = read("lib/legal.ts");
  assert.match(legal, /export function legalDetailsPending/);
  for (const page of ["app/privacy/page.tsx", "app/terms/page.tsx"]) {
    const source = read(page);
    assert.match(source, /legalDetailsPending\(\)/, `${page} must declare itself unfinished while unfilled`);
    assert.match(source, /not yet in force/, `${page} must say so in words, not only by styling`);
  }
  // And the banner must disappear on its own once the details are filled in,
  // rather than needing someone to remember to delete it.
  assert.match(legal, /\.some\(isPlaceholder\)/, "the banner must be driven by the values, not by a flag");
});

test("the pricing page can capture intent, and the notice declares why", () => {
  // The page advertised three plans and sold none. "Planned for launch" was a
  // dead end where the one useful question belonged: would you pay for this?
  const pricing = read("app/pricing/page.tsx");
  assert.ok(pricing.includes("<PlanInterest plan={plan.name} />"), "a plan with no CTA must ask instead");
  assert.doesNotMatch(pricing, /pricing-cta-muted/, "the dead end must be gone, not merely hidden");

  // An email address is personal data taken on consent, so the privacy notice
  // has to carry the purpose and the basis — collecting it silently would
  // make the notice untrue the moment someone typed into the form.
  const legal = read("lib/legal.ts");
  assert.match(legal, /Article 6\(1\)\(a\)/, "consent must be named as the basis for the address");
  assert.match(legal, /withdraw it at any time/, "a consent with no withdrawal route is not a consent");

  const route = read("app/api/plan-interest/route.ts");
  const form = read("components/plan-interest.tsx");
  assert.match(form, /const CONSENT =/, "the exact wording agreed to must be sent and stored");
  assert.match(route, /p_consent_text/);
  // Every outcome answers identically. Anything else lets a stranger test
  // whether a given address is on the list.
  assert.doesNotMatch(route, /status:\s*(4\d\d|5\d\d)/, "the endpoint must not distinguish outcomes by status");
});

test("the server's language reaches the first render of every client component", () => {
  // The server set <html lang="ar"> and then sent the page in English: the
  // client hook started at "en" and corrected itself after hydration. An
  // Arabic reader saw English flash past on every load, and a crawler never
  // saw anything else.
  const layout = read("app/layout.tsx");
  const text = read("components/localized-text.tsx");
  assert.match(layout, /<LanguageProvider initial=\{language\}>/);
  assert.match(text, /const initial = useContext\(InitialLanguage\);/);
  assert.match(text, /useState<AppLanguage>\(initial\)/);
  assert.doesNotMatch(text, /useState<AppLanguage>\("en"\)/,
    "starting at English regardless of the reader is the defect this replaced");
});

test("no dictionary declares the same key twice", () => {
  // A duplicate key is a syntax error under tsc (TS1117) but not to the unit
  // suite, so it used to reach CI. Adding a phrase that already exists is the
  // easy mistake — the later entry silently wins, or the build breaks.
  //
  // This test used to do its own parsing and matched one key per line. Parts
  // of lib/i18n.ts pack several pairs onto a line, so every key after the
  // first was invisible and real duplicates passed it. It now shares the
  // parser in test/helpers, which reads them all.
  const duplicates = duplicateKeys();
  for (const [name, keys] of Object.entries(duplicates)) {
    assert.deepEqual(keys, [], `dictionary ${name} declares a key twice`);
  }
});

test("the duplicate-key check reads keys that share a line", () => {
  // The flaw that let duplicates through, pinned so it cannot come back.
  const packed = [
    'const NB: Record<string, string> = {',
    '  "A":"a", "B":"b", "C":"c",',
    '  "B":"b again",',
    '};',
    'const AR: Record<string, string> = { "A":"أ", "Placeholder":"{count} شيء", };',
    'const ES: Record<string, string> = { "A":"a" };',
    'const FR: Record<string, string> = { "A":"a" };',
    'const DE: Record<string, string> = { "A":"a" };',
  ].join("\n");
  assert.deepEqual(duplicateKeys(packed).NB, ["B"],
    "a duplicate sharing a line with other pairs must still be found");
  // And a { } inside a value must not be mistaken for the end of the object.
  assert.equal(readDictionaries(packed).AR.get("Placeholder"), "{count} شيء");
});

test("the open interest endpoint cannot be used to fill the database", () => {
  // record_plan_interest must stay callable by anon — the people worth hearing
  // from have not signed up — and it deliberately records nothing about the
  // caller, so no per-person rate limit is available. A daily ceiling needs
  // none, and bounds the worst case in advance.
  const cap = readFileSync(
    join(webRoot, "../../supabase/migrations/20261106120000_plan_interest_daily_cap.sql"), "utf8");
  assert.match(cap, /v_today >= 500/, "the function must stop accepting rows past a daily ceiling");
  assert.doesNotMatch(cap, /x-forwarded-for|ip_address|user_agent/i,
    "a rate limit must not be bought by starting to record who the caller is");

  const form = read("components/plan-interest.tsx");
  assert.match(form, /name="company"/, "a honeypot field catches the scripts that fill every input");
  assert.match(form, /aria-hidden="true"/, "the honeypot must be hidden from assistive technology too");
});

test("the theme button keeps its own colour inside the dark navigation", () => {
  // In dark mode the sun was drawn at 1.16:1 and could not be seen. The cause
  // was specificity, not the colour chosen: the nav's rule for its buttons,
  // meant for sign-out, outranked `.theme-switcher`. Two earlier fixes changed
  // the glyph size and the light-mode colour and left this untouched, because
  // neither looked at what the browser actually computed.
  const css = read("app/globals.css");
  assert.match(css, /:root\[data-theme="dark"\] \.primary-nav > button \{[^}]*color:/,
    "the nav button rule this guards against has moved; re-check the theme button in dark mode");
  assert.match(css, /:root\[data-theme="dark"\] \.primary-nav > button\.theme-switcher[^{]*\{[^}]*color:var\(--ink\)/,
    "the theme button must out-rank the nav button rule in dark mode");
});
