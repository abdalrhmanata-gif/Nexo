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

test("notification badge is scoped to workspace routes and pauses in hidden tabs", () => {
  const bell = read("components/notification-bell.tsx");
  const shell = read("components/shell.tsx");
  const endpoint = read("app/api/notifications/route.ts");
  assert.ok(bell.includes("usePathname"));
  assert.ok(bell.includes('const isWorkspaceRoute = pathname === "/app" || pathname.startsWith("/app/");'));
  assert.ok(bell.includes("if (!isWorkspaceRoute) return null;"));
  assert.ok(shell.includes("<NotificationBell />"));
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
  assert.equal(auth.split('await import("../lib/supabase/browser")').length - 1, 2);
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
