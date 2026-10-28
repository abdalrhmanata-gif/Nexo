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
  assert.match(shell, /<NotificationBell\s*\/>/);
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

test("notification badge is global and obtains its count from an authenticated server boundary", () => {
  const bell = read("components/notification-bell.tsx");
  const endpoint = read("app/api/notifications/route.ts");
  assert.doesNotMatch(bell, /inBusinessWorkspace/);
  assert.match(bell, /fetch\("\/api\/notifications"/);
  assert.match(endpoint, /createSupabaseMissionRepository/);
  assert.match(endpoint, /repository\.listMissions\(\)/);
  assert.match(endpoint, /Cache-Control/);
});

test("business page does not pretend to send invitations without a secure backend", () => {
  const page = read("app/app/business/page.tsx");
  assert.match(page, /Invite a teammate/);
  assert.match(page, /disabled/);
  assert.match(page, /No invitation is sent/);
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

test("current navigation styling distinguishes the active page and Workspace scope", () => {
  const nav = read("components/nav-link.tsx");
  const css = read("app/globals.css");
  assert.match(nav, /href="\\/app" prefix="\\/app\\/missions"/);
  assert.match(css, /a\\[aria-current="page"\\]:not\\(\\.button\\):not\\(\\.nav-featured\\)/);
  assert.match(css, /a\\.button\\[aria-current="page"\\]/);
  assert.match(css, /a\\.nav-featured\\[aria-current="page"\\]/);
  assert.match(css, /\.topbar nav[^\\n]*flex-wrap:wrap/);
});

test("Search fragment can receive keyboard focus on navigation", () => {
  const page = read("app/app/page.tsx");
  assert.match(page, /id="mission-search"[^>]*tabIndex=\\{-1\\}/);
});
