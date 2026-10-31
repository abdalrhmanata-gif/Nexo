import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import test from "node:test";
import { normalizeAppLanguage, resolveAppLanguagePreference } from "../lib/app-language.mjs";
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

test("language control uses the shared six-language list and Arabic right-to-left direction", () => {
  const language = read("components/language-switcher.tsx");
  const preference = read("lib/app-language.mjs");
  assert.match(language, /APP_LANGUAGES/);
  assert.match(language, /document\.documentElement\.dir = language === "ar" \? "rtl" : "ltr"/);
  assert.match(language, /localStorage\.setItem/);
  assert.match(preference, /\["en", "nb", "ar", "es", "fr", "de"\]/);
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
  const languageModule = read("lib/app-language.mjs");
  assert.match(language, /APP_LANGUAGES/);
  assert.match(languageModule, /\["en", "nb", "ar", "es", "fr", "de"\]/);
  assert.match(language, /document\.documentElement\.dir = language === "ar" \? "rtl" : "ltr"/);
});

test("all literal Opportunity Intelligence translations exist in every non-English locale", () => {
  const components = [
    read("components/opportunity-intelligence.tsx"),
    read("components/opportunity-evidence-panel.tsx"),
    read("components/opportunity-analysis-panel.tsx"),
  ];
  const keys = new Set(components.flatMap((source) =>
    [...source.matchAll(/\bt\("([^"]+)"\)/g)].map((match) => match[1]).filter((key) => !/^https?:\/\//i.test(key))
  ));
  const naturallySharedWords = {
    nb: new Set(["For:"]),
    fr: new Set(["Effort"]),
    de: new Set(["optional"]),
  };
  for (const language of ["nb", "ar", "es", "fr", "de"]) {
    for (const key of keys) {
      assert.notEqual(translateUiText(language, key), undefined, `missing ${language} key: ${key}`);
      if (!naturallySharedWords[language]?.has(key)) {
        assert.notEqual(translateUiText(language, key), key, `missing ${language} translation: ${key}`);
      }
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
  assert.match(templates, /function templateHref\(template: typeof templates\[number\], t: \(source: string\) => string\)/);
  assert.match(templates, /intent: t\(template\.intent\)/);
  assert.match(templates, /criteria: template\.criteria\.map\(t\)/);
  assert.match(templates, /actions: template\.actions\.map\(t\)/);
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

test("privacy note uses the actual translation key, not a nested translation expression", () => {
  const opportunity = read("components/opportunity-intelligence.tsx");
  assert.match(opportunity, /opportunity-storage-note">\{t\("Privacy and portability:/);
  assert.doesNotMatch(opportunity, /t\("\{t\(/);
  const phrase = "Privacy and portability: opportunities and evidence notes are stored only in this browser. Export a backup to move them to another device; the file may contain sensitive business information, so store it securely. Import merges records and skips matching IDs without overwriting existing data. Cloud sync, live discovery, automatic source verification, recurring monitoring, and outcome-based learning are not connected yet.";
  for (const locale of ["nb", "ar", "es", "fr", "de"]) assert.notEqual(translateUiText(locale, phrase), phrase);
});

test("mission cards localize deterministic guidance and lifecycle pills", () => {
  const card = read("components/mission-card.tsx");
  const shell = read("components/shell.tsx");
  assert.ok(card.includes("LocalizedMissionNextStep"));
  const nextStep = read("components/localized-mission-next-step.tsx");
  assert.match(nextStep, /t\(label\)/);
  assert.match(nextStep, /t\(detail\)/);
  assert.match(shell, /LocalizedText en=\{missionStatusLabel\(status\)\}/);
  for (const locale of ["nb", "ar", "es", "fr", "de"]) {
    for (const label of ["Follow-up due", "Start next action", "Waiting on you", "Ready to check", "Outcome recorded", "This mission has a verified outcome."]) {
      assert.notEqual(translateUiText(locale, label), label);
    }
  }
});

test("sign-out and notification accessible labels use the selected locale", () => {
  const auth = read("components/auth-form.tsx");
  const bell = read("components/notification-bell.tsx");
  assert.match(auth, /useUiTranslation/);
  assert.match(auth, /t\("Sign out"\)/);
  assert.match(bell, /useUiTranslation/);
  assert.match(bell, /title=\{t\("Notifications"\)\}/);
  for (const locale of ["nb", "ar", "es", "fr", "de"]) {
    for (const label of ["Sign out", "Signing out…", "items need attention"]) assert.notEqual(translateUiText(locale, label), label);
  }
});

test("new mission form labels, helper text and placeholders use the shared locale layer", () => {
  const page = read("app/app/missions/new/page.tsx");
  const fields = read("components/localized-form-fields.tsx");
  assert.ok(page.includes("<LocalizedInput"));
  assert.ok(page.includes("<LocalizedTextarea"));
  assert.ok(page.includes("<LocalizedText"));
  assert.ok(fields.includes("placeholder={t(placeholder)}"));
  for (const locale of ["nb", "ar", "es", "fr", "de"]) {
    for (const label of ["Mission name", "Intent", "Success criteria", "First steps", "Create mission", "What should this mission help you accomplish?"]) {
      assert.notEqual(translateUiText(locale, label), label);
    }
  }
});




test("shared dictionary keeps Norwegian and Arabic translations in the correct language columns", () => {
  const source = read("lib/ui-translations.mjs");
  const rows = source.split("\n")
    .filter((line) => line.trim().startsWith('["'))
    .map((line) => [...line.matchAll(/"(?:\\.|[^"\\])*"/g)].map((match) => JSON.parse(match[0])))
    .filter((row) => row.length === 6);
  assert.ok(rows.length > 0, "translation rows should be discoverable");
  assert.doesNotMatch(source, /^\\s*,\\s*$/m, "translation row array must not contain empty slots");
  assert.equal(rows.length, UI_TRANSLATION_KEYS.length, "every translation key must have a complete six-column row");
  const arabicScript = /[\u0600-\u06FF]/u;
  const translationsByKey = new Map();

  for (const [key, norwegian, arabic] of rows) {
    assert.doesNotMatch(norwegian, arabicScript, "Norwegian translation contains Arabic script: " + key);
    if (!key.startsWith("https://")) {
      assert.match(arabic, arabicScript, "Arabic translation is missing Arabic script: " + key);
    }
    const current = [norwegian, arabic];
    const previous = translationsByKey.get(key);
    if (previous) assert.deepEqual(current, previous, "duplicate translation rows disagree for: " + key);
    else translationsByKey.set(key, current);
  }

  assert.equal(translateUiText("nb", "Find the opportunity. Prove it. Turn it into action."), "Finn muligheten. Bevis den. Gjør den om til handling.");
  assert.equal(translateUiText("ar", "Find the opportunity. Prove it. Turn it into action."), "اكتشف الفرصة. أثبت جدواها. حوّلها إلى عمل.");
});


test("Norwegian browser locale aliases normalize to the supported Bokmål locale", () => {
  assert.equal(normalizeAppLanguage("no"), "nb");
  assert.equal(normalizeAppLanguage("no-NO"), "nb");
  assert.equal(normalizeAppLanguage("no_NO"), "nb");
  assert.equal(normalizeAppLanguage("nb-NO"), "nb");
  assert.equal(normalizeAppLanguage("ar-SA"), "ar");
  assert.equal(normalizeAppLanguage("fr-FR"), "fr");
  assert.equal(normalizeAppLanguage("not-a-locale"), null);
  assert.equal(normalizeAppLanguage(null), null);
});

test("invalid stored language does not hide a valid cookie or browser preference", () => {
  assert.equal(resolveAppLanguagePreference("unsupported", "ar", ["no-NO"]), "ar");
  assert.equal(resolveAppLanguagePreference("unsupported", "also-unsupported", ["no-NO", "en-US"]), "nb");
  assert.equal(resolveAppLanguagePreference("fr-FR", "ar", ["no-NO"]), "fr");
  assert.equal(resolveAppLanguagePreference(null, null, ["xx-XX", "de-DE"]), "de");
  assert.equal(resolveAppLanguagePreference(null, null, []), "en");
});

test("language selector and localized text share one preference resolver", () => {
  const selector = read("components/language-switcher.tsx");
  const localized = read("components/localized-text.tsx");
  assert.match(selector, /resolveAppLanguagePreference/);
  assert.match(localized, /resolveAppLanguagePreference/);
  assert.match(localized, /normalizeAppLanguage/);
});


test("public landing, authentication, and mission detail use the six-language localization layer", () => {
  const sources = [
    read("app/page.tsx"),
    read("app/app/business/page.tsx"),
    read("app/app/notifications/page.tsx"),
    read("app/auth/sign-in/page.tsx"),
    read("app/auth/sign-up/page.tsx"),
    read("components/auth-form.tsx"),
    read("app/app/missions/[id]/page.tsx"),
    read("components/verification-controls.tsx"),
    read("components/mission-mutation-controls.tsx"),
    read("components/action-mutation-controls.tsx"),
    read("components/add-action-form.tsx"),
    read("components/delete-mission-form.tsx"),
    read("components/localized-mission-value.tsx"),
  ];

  const keys = new Set(sources.flatMap((source) => [
    ...[...source.matchAll(/<LocalizedText\\s+en="([^"]+)"/g)].map((match) => match[1]),
    ...[...source.matchAll(/\\bt\\("([^"]+)"\\)/g)].map((match) => match[1]),
    ...[...source.matchAll(/\\bt\\("([^"]+)"\\)/g)].map((match) => match[1]),
  ]));

  for (const phrase of [
    "Make intent explicit",
    "Define the outcome, success criteria, and boundaries before work begins.",
    "Know what happens next",
    "Track each Mission, its actions, blockers, and progress in one place.",
    "Decide with evidence",
    "Compare opportunities, record what you know, and expose what is still uncertain.",
    "Welcome back",
    "Sign in.",
    "Get started",
    "Create your account.",
    "Email",
    "Password",
    "Enter a valid email address.",
    "Mission detail",
    "Deterministic guidance",
    "What should I do next?",
    "Plan health",
    "Success criteria",
    "Recent checkpoints",
    "At a glance",
    "Draft",
    "Planning",
    "Ready to start",
    "In progress",
    "Waiting",
    "Needs your input",
    "Checking the evidence",
    "Complete",
    "Paused",
    "Blocked",
    "Did not succeed",
    "Cancelled",
    "Not started",
    "This work has not begun yet.",
    "This work is underway now.",
    "This work is finished.",
    "Paused until something outside this action unblocks it. This is not complete.",
    "This work will not be done.",
    "no further changes",
    "waiting actions",
    "Follow up:",
    "Continue:",
    "Start:",
    "Resolve waiting:",
    "This mission cannot move to checking the evidence from its current state.",
    "Move this mission to checking the evidence before recording verification.",
    "This mission has a verified outcome.",
    "Every action is resolved. Move this mission to checking the evidence.",
    "Every action is resolved. Record the evidence that proves the outcome.",
  ]) keys.add(phrase);

  const naturallySharedWords = { fr: new Set(["Notifications", "Actions"]) };
  for (const language of ["nb", "ar", "es", "fr", "de"]) {
    for (const key of keys) {
      if (naturallySharedWords[language]?.has(key)) continue;
      assert.notEqual(
        translateUiText(language, key),
        key,
        `missing ${language} translation for public/workspace/auth/mission workflow: ${key}`
      );
    }
  }

  assert.match(read("app/page.tsx"), /<LocalizedText en="Mission control for AI-assisted work"/);
  assert.match(read("app/app/business/page.tsx"), /<LocalizedText en="Business workspace"/);
  assert.match(read("app/app/notifications/page.tsx"), /<LocalizedText en="Workspace updates"/);
  assert.match(read("app/auth/sign-in/page.tsx"), /<LocalizedText en="Welcome back"/);
  assert.match(read("app/auth/sign-up/page.tsx"), /<LocalizedText en="Create your account\."\s*\/>/);
  assert.match(read("components/auth-form.tsx"), /t\("Enter a valid email address\."\)/);
  assert.match(read("app/app/missions/[id]/page.tsx"), /LocalizedMissionNextStep/);
  assert.match(read("components/verification-controls.tsx"), /useUiTranslation/);
  assert.match(read("components/mission-mutation-controls.tsx"), /useUiTranslation/);
  assert.match(read("components/action-mutation-controls.tsx"), /useUiTranslation/);
  assert.match(read("components/add-action-form.tsx"), /useUiTranslation/);
  assert.match(read("components/delete-mission-form.tsx"), /useUiTranslation/);
});
