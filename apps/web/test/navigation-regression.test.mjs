import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, resolve } from "node:path";
import test from "node:test";

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
  assert.match(shell, /LocalizedText en="Home" nb="Hjem" ar="الرئيسية"/);
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
