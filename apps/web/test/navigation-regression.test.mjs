import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import test from "node:test";
import { translateUiText, UI_TRANSLATIONS } from "../lib/ui-translations.mjs";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(webRoot, path), "utf8");

test("global navigation and auth cross-links do not prefetch unopened pages", () => {
  const shell = read("components/shell.tsx");
  assert.match(shell, /<Link className="brand" href="\/" prefetch=\{false\}>/);
  assert.match(shell, /href="\/app#mission-search"[^>]*prefetch=\{false\}/);
  assert.match(shell, /href="\/app\/missions\/new"[^>]*prefetch=\{false\}/);
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

test("primary product surfaces have translations in every supported language", () => {
  const required = [
    "What needs your attention",
    "Launch a small project",
    "Make an evidence-based decision",
    "Find the opportunity. Prove it. Turn it into action.",
    "Find the next move worth making.",
    "Opportunity radar",
    "Keep your opportunity data portable",
    "Evidence ledger",
    "Generate AI brief",
    "Proposed launch pricing, not active offers. Paid billing and usage enforcement are not enabled; AI Opportunity Brief access is restricted to an approved preview tester.",
  ];
  for (const language of ["nb", "ar", "es", "fr", "de"]) {
    for (const label of required) {
      assert.notEqual(translateUiText(language, label), label, `missing ${language} translation for: ${label}`);
      assert.ok(translateUiText(language, label).trim().length > 0);
    }
  }
  assert.ok(Object.keys(UI_TRANSLATIONS.ar).length >= required.length);
});

test("template cards no longer force English text as Norwegian or Arabic translations", () => {
  const templates = read("app/templates/page.tsx");
  assert.doesNotMatch(templates, /nb=\{template\.(?:title|description)\}|ar=\{template\.(?:title|description)\}/);
  assert.doesNotMatch(templates, /nb=\{criterion\}|ar=\{criterion\}/);
  for (const label of ["Launch a small project", "Make an evidence-based decision", "Improve a weekly workflow"]) {
    assert.ok(templates.includes(label));
    for (const language of ["nb", "ar", "es", "fr", "de"]) assert.notEqual(translateUiText(language, label), label);
  }
});

test("Workspace and Opportunity Intelligence UI use the shared language layer", () => {
  const workspace = read("app/app/page.tsx");
  const opportunity = read("components/opportunity-intelligence.tsx");
  const evidence = read("components/opportunity-evidence-panel.tsx");
  const analyst = read("components/opportunity-analysis-panel.tsx");
  assert.ok(workspace.includes("<LocalizedText"));
  assert.ok(opportunity.includes("useUiTranslation"));
  assert.ok(evidence.includes("useUiTranslation"));
  assert.ok(analyst.includes("useUiTranslation"));
  for (const file of [opportunity, evidence, analyst]) assert.ok(file.includes('from "./localized-text"'));
});

test("Arabic uses right-to-left direction while all six languages remain selectable", () => {
  const language = read("components/language-switcher.tsx");
  for (const locale of ['"en"', '"nb"', '"ar"', '"es"', '"fr"', '"de"']) assert.ok(language.includes(locale));
  assert.match(language, /document\.documentElement\.dir = language === "ar" \? "rtl" : "ltr"/);
});

test("all literal Opportunity Intelligence translations exist in every non-English locale", () => {
  const components = [
    read("components/opportunity-intelligence.tsx"),
    read("components/opportunity-evidence-panel.tsx"),
    read("components/opportunity-analysis-panel.tsx"),
  ];
  const keys = new Set(components.flatMap((source) =>
    [...source.matchAll(/\bt\("([^"]+)"\)/g)].map((match) => match[1])
  ));
  for (const language of ["nb", "ar", "es", "fr", "de"]) {
    for (const key of keys) {
      assert.notEqual(translateUiText(language, key), key, `missing ${language} translation: ${key}`);
    }
  }
});

test("Opportunity Intelligence hook and all long-form informational copy use the translator", () => {
  const opportunity = read("components/opportunity-intelligence.tsx");
  assert.match(opportunity, /export function OpportunityIntelligence\(\) \{\s+const t = useUiTranslation\(\);/);
  assert.doesNotMatch(opportunity, /<p className="opportunity-storage-note">Privacy and portability:/);
  assert.doesNotMatch(opportunity, /<p><strong>\{t\("Priority ="\)\}<\/strong> 25% strategic fit/);
});

test("template prefill content follows the selected locale", () => {
  const templates = read("app/templates/page.tsx");
  assert.match(templates, /function templateHref\\(template: typeof templates\\[number\\], t: \\(source: string\\) => string\\)/);
  assert.match(templates, /intent: t\\(template\\.intent\\)/);
  assert.match(templates, /criteria: template\\.criteria\\.map\\(t\\)/);
  assert.match(templates, /actions: template\\.actions\\.map\\(t\\)/);
  for (const locale of ["nb", "ar", "es", "fr", "de"]) {
    for (const phrase of [
      "Prepare and validate a small project launch while keeping cost, timing, and risk visible.",
      "Compare realistic options using trustworthy evidence and make a decision with assumptions and uncertainties clearly stated.",
      "Improve one recurring workflow without disrupting critical operations, and confirm whether the change helped.",
      "Describe the target user and problem",
      "Collect evidence for demand",
      "Draft milestones, costs, and risks",
      "Define the decision and constraints",
      "Collect primary or authoritative sources",
      "Compare options and record open questions",
      "Map the current steps and bottlenecks",
      "Choose a small reversible change",
      "Review results and decide whether to keep it"
    ]) assert.notEqual(translateUiText(locale, phrase), phrase);
  }
});
