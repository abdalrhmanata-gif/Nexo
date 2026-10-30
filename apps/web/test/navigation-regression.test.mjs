import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import test from "node:test";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(webRoot, path), "utf8");

test("primary navigation restores the key destinations and keeps Opportunity Intelligence", () => {
  const shell = read("components/shell.tsx");
  for (const label of ["Search", "New mission", "Business", "Templates", "Pricing", "Opportunity Intelligence"]) {
    assert.ok(shell.includes(`en="${label}"`), `missing ${label} from primary navigation`);
  }
  for (const route of ["/app#mission-search", "/app/missions/new", "/app/business", "/templates", "/pricing", "/app/opportunities"]) {
    assert.ok(shell.includes(route), `missing navigation route ${route}`);
  }
  assert.match(shell, /<WorkspaceNavActions\s*\/>/);
  assert.doesNotMatch(shell, /NotificationBell|SignOutButton/);
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

test("workspace-only navigation controls are lazy-loaded and notifications pause in hidden tabs", () => {
  const actions = read("components/workspace-nav-actions.tsx");
  const bell = read("components/notification-bell.tsx");
  const shell = read("components/shell.tsx");
  const endpoint = read("app/api/notifications/route.ts");
  assert.match(actions, /usePathname/);
  assert.match(actions, /pathname === "\/app" \|\| pathname\.startsWith\("\/app\/"\)/);
  assert.match(actions, /dynamic\([\s\S]*notification-bell/);
  assert.match(actions, /dynamic\([\s\S]*sign-out-button/);
  assert.match(actions, /if \(!isWorkspaceRoute\) return null/);
  assert.doesNotMatch(shell, /NotificationBell|SignOutButton/);
  assert.doesNotMatch(bell, /usePathname/);
  assert.match(bell, /if \(document\.visibilityState !== "visible"\) return/);
  assert.match(bell, /document\.addEventListener\("visibilitychange"/);
  assert.match(bell, /document\.removeEventListener\("visibilitychange"/);
  assert.match(bell, /fetch\("\/api\/notifications"/);
  assert.match(endpoint, /createSupabaseMissionRepository/);
  assert.match(endpoint, /repository\.listMissions\(\)/);
  assert.match(endpoint, /Cache-Control/);
});

test("Supabase browser SDK is loaded only when the user submits an auth action", () => {
  const auth = read("components/auth-form.tsx");
  const signOut = read("components/sign-out-button.tsx");
  assert.doesNotMatch(auth, /^import .*supabase\/browser/m);
  assert.match(auth, /await import\("\.\.\/lib\/supabase\/browser"\)/);
  assert.doesNotMatch(signOut, /^import .*supabase\/browser/m);
  assert.match(signOut, /await import\("\.\.\/lib\/supabase\/browser"\)/);
  assert.match(auth, /async function submit/);
  assert.match(signOut, /async function signOut/);
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
