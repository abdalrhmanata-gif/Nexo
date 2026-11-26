import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { GOAL_EXAMPLES, GOAL_MAX_LENGTH, goalTitle, matchGoal, normaliseGoal } from "../lib/goal-plan.mjs";
import { COUNTED_ROUTES, GUIDE_SLUGS, TEMPLATE_IDS, normaliseRoute } from "../lib/metrics-routes.mjs";
import { umamiPageFor } from "../lib/umami.mjs";

// The goal box on the home page shows a plan before any account exists.
// What it shows has to be the right plan, in every language, or the first
// thing a visitor learns about the product is that it misread them.

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(webRoot, path), "utf8");

/** The dictionary value for an English key in one language, read from source. */
function translation(lang, key) {
  const source = read("lib/i18n.ts");
  const start = source.indexOf(`const ${lang.toUpperCase()}: Record<string, string> = {`);
  assert.ok(start >= 0, `dictionary ${lang} was found`);
  const end = source.indexOf("\n};", start);
  const block = source.slice(start, end);
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`[\\n,{]\\s*"${escaped}":\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(block);
  return match ? JSON.parse(`"${match[1]}"`) : null;
}

const expectMatch = (goal, source, id) => {
  const match = matchGoal(goal);
  assert.ok(match, `"${goal}" is read`);
  assert.deepEqual({ source: match.source, id: match.id }, { source, id }, `"${goal}"`);
};

test("every example under the box lands on its plan, in every language", () => {
  for (const example of GOAL_EXAMPLES) {
    expectMatch(example.goal, example.expect.source, example.expect.id);
    for (const lang of ["nb", "ar", "es", "fr", "de"]) {
      const goal = translation(lang, example.goal);
      assert.ok(goal, `${lang} translates the example "${example.goal}"`);
      expectMatch(goal, example.expect.source, example.expect.id);
    }
  }
});

test("a country guide needs the country and a move, not either alone", () => {
  expectMatch("I want to live in Berlin", "guide", "moving-to-germany-checklist");
  expectMatch("أريد العمل في ألمانيا", "guide", "moving-to-germany-checklist");
  expectMatch("Find a job in Germany", "guide", "moving-to-germany-checklist");
  // A trip and a language course are not a relocation.
  expectMatch("A weekend trip to Berlin", "planner", "travel");
  expectMatch("Learn German", "planner", "study");
  // Moving somewhere without a guide gets the planner's move plan.
  expectMatch("Move to Canada", "planner", "move");
});

test("the UK guide needs the UK and a move, like the Germany one", () => {
  for (const goal of ["Move to London", "Moving to the UK for work", "Find a job in London", "الانتقال إلى بريطانيا",
    "أريد العمل في لندن", "Mudarme a Londres", "S'installer au Royaume-Uni", "Nach Großbritannien umziehen", "Flytte til Storbritannia"]) {
    expectMatch(goal, "guide", "moving-to-the-uk-checklist");
  }
  expectMatch("A weekend trip to London", "planner", "travel");
  expectMatch("Learn English in London", "planner", "study");
  // French verbs written with an apostrophe still count as a move.
  expectMatch("Déménager en Allemagne et m'y installer", "guide", "moving-to-germany-checklist");
  expectMatch("M'installer au Canada", "template", "settle-new-country");
});

test("American guides need America, except where only America has the thing", () => {
  expectMatch("Start a business in the US", "guide", "how-to-start-a-business");
  expectMatch("Get an EIN for my company", "guide", "how-to-get-an-ein");
  expectMatch("Open a business bank account for my LLC", "guide", "how-to-open-a-business-bank-account");
  expectMatch("Write a business plan", "guide", "how-to-write-a-business-plan");
  // "us" in lower case is a pronoun, and "ein" is a German article.
  expectMatch("Help us start a company", "planner", "venture");
  expectMatch("Ein kleines Café eröffnen", "planner", "venture");
  expectMatch("Open a business bank account", "planner", "generic");
});

test("templates and the planner divide the rest", () => {
  expectMatch("Plan a birthday party", "template", "organise-an-event");
  expectMatch("Hire a developer", "planner", "hiring");
  expectMatch("Launch my app", "planner", "product");
  expectMatch("Grow my business", "template", "business-opportunity-scan");
  expectMatch("Should I buy or rent?", "template", "research-decision");
  expectMatch("Settle in after moving to Spain", "template", "settle-new-country");
  expectMatch("Open a pharmacy", "planner", "venture");
  assert.equal(matchGoal("Open a pharmacy").licensed, true, "a pharmacy leads with its licence");
  assert.equal(matchGoal("Open a bookshop").licensed, false);
});

test("anything readable gets a plan; too little gets none", () => {
  expectMatch("Run a marathon", "planner", "generic");
  assert.equal(matchGoal(""), null);
  assert.equal(matchGoal("ab"), null);
  assert.equal(matchGoal(null), null);
});

test("a goal is tidied, never trusted as markup or as unlimited text", () => {
  assert.equal(normaliseGoal("  move\n\tto   Germany‏ "), "move to Germany");
  assert.equal(normaliseGoal("x".repeat(500)).length, GOAL_MAX_LENGTH);
  assert.equal(goalTitle("open a small café."), "Open a small café");
  assert.equal(goalTitle("فتح مقهى صغير؟"), "فتح مقهى صغير");
  const long = goalTitle(`${"word ".repeat(40)}end`);
  assert.ok(long.length <= 101 && long.endsWith("…"), "a long goal is cut at a word");
});

test("the plan text is rebuilt on the server, never read from the browser", () => {
  const actions = read("app/app/start/actions.ts");
  // The action reads which plan, and builds its steps itself.
  assert.match(actions, /readStartRequest\(/);
  assert.match(actions, /buildStartPlan\(request\)/);
  assert.doesNotMatch(actions, /formData\.get\("actions"\)|formData\.get\("criteria"\)/);
  const fields = read("components/start-plan-preview.tsx");
  assert.match(fields, /name=\{plan\.request\.kind\}/);
  assert.doesNotMatch(fields, /name="actions"/);
});

test("a plan saves itself only when the person asked for it", () => {
  const page = read("app/app/start/page.tsx");
  // The cookie is set by our server (the Save action or the confirmation
  // routes); a link alone gets a preview and a button.
  assert.match(page, /get\(START_COOKIE\)\?\.value === startToken\(request\)/);
  assert.match(page, /\{autoSave && <AutoSubmit/);
  const actions = read("app/app/start/actions.ts");
  assert.match(actions, /store\.delete\(START_COOKIE\)/, "the cookie is removed after any attempt, so a failure cannot loop");
  assert.match(actions, /findRecentMission/, "a repeated press finds the plan it already saved");
  const landing = read("lib/auth/landing.ts");
  assert.match(landing, /if \(next === DEFAULT_POST_AUTH_PATH\) path = safeNextPath\(pending\)/,
    "a pending destination is checked like any other and only replaces the default");
});

test("signing up keeps the destination through every door", () => {
  const form = read("components/auth-form.tsx");
  assert.match(form, /pending_next: nextPath/, "sign-up records where it was going for the confirmation link");
  assert.match(form, /auth\.resend\(/, "the confirmation email can be sent again");
  assert.doesNotMatch(form, /then sign in/, "confirming no longer asks the person to sign in afterwards");
  assert.match(read("app/auth/sign-in/page.tsx"), /\/auth\/sign-up\?next=\$\{encodeURIComponent\(next\)\}/);
  assert.match(read("app/auth/sign-up/page.tsx"), /\/auth\/sign-in\?next=\$\{encodeURIComponent\(next\)\}/);
  const middleware = read("middleware.ts");
  assert.match(middleware, /pathname === "\/app\/start"\) return "\/auth\/sign-up"/);
  assert.match(middleware, /safeNextPath\(request\.nextUrl\.searchParams\.get\("next"\)\)/,
    "a signed-in person sent to sign-up goes where the link was going");
  for (const route of ["app/auth/confirm/route.ts", "app/auth/callback/route.ts"]) {
    assert.match(read(route), /redirectToLanding\(await landingAfterSignIn\(/, route);
  }
});

test("the Google button appears only when Google is switched on", () => {
  const providers = read("lib/auth/providers.ts");
  assert.match(providers, /\/auth\/v1\/settings/);
  assert.match(providers, /external\?\.google === true/);
  for (const page of ["app/auth/sign-in/page.tsx", "app/auth/sign-up/page.tsx"]) {
    assert.match(read(page), /google=\{google\}/, page);
  }
  assert.match(read("components/auth-form.tsx"), /\{google && </);
});

test("the guides and templates people arrive on are counted, by name only", () => {
  const guides = [...read("lib/guides/en.ts").matchAll(/^ {6}slug: "([^"]+)"/gm)].map((m) => m[1]);
  assert.deepEqual([...GUIDE_SLUGS].sort(), [...guides].sort(), "GUIDE_SLUGS lists every guide");
  const templates = [...read("lib/mission-templates.ts").matchAll(/^ {4}id: "([^"]+)"/gm)].map((m) => m[1]);
  assert.deepEqual([...TEMPLATE_IDS].sort(), [...templates].sort(), "TEMPLATE_IDS lists every template");
  for (const path of ["/try", "/guides/moving-to-germany-checklist", "/ar/guides/how-to-start-an-llc", "/de/guides", "/templates/find-a-job"]) {
    assert.equal(normaliseRoute(path), path);
    assert.equal(umamiPageFor(`${path}?goal=private words`), path, "public, and the query never leaves");
  }
  assert.equal(normaliseRoute("/guides/invented-slug"), "other");
  assert.equal(normaliseRoute("/app/start?goal=x"), "/app/start");
  assert.equal(umamiPageFor("/app/start"), null, "the workspace is never reported to Umami");
  // The database refuses longer paths; every counted one must fit.
  assert.ok(COUNTED_ROUTES.every((route) => route.length <= 64 && /^[a-z0-9/_[\]-]+$/.test(route)));
});

test("the privacy notice names what the try box and the save cookie do", () => {
  const privacy = read("app/privacy/page.tsx");
  assert.match(privacy, /zavqera-start/);
  assert.match(privacy, /Signing in with Google/);
  assert.match(privacy, /We do not save it unless you press/);
  assert.match(read("lib/start-plan-token.ts"), /START_COOKIE = "zavqera-start"/);
});

test("the box's example, onboarding a new employee, lands on the onboarding checklist in every language", () => {
  const example = read("components/goal-starter.tsx").match(/placeholder=\{t\("([^"]+)"\)\}/)[1];
  assert.equal(example, "e.g. Onboard a new employee");
  const goal = (text) => text.replace(/^(e\.g\.|f\.eks\.|مثلاً:|p\. ej\.,|ex\. :|z\. B\.)\s*/, "");
  expectMatch(goal(example), "checklist", "employee-onboarding-checklist");
  for (const lang of ["nb", "ar", "es", "fr", "de"]) {
    const translated = translation(lang, example);
    assert.ok(translated, `${lang} translates the box's example`);
    expectMatch(goal(translated), "checklist", "employee-onboarding-checklist");
  }
  // Hiring someone is a hiring plan, and a new client is a client.
  for (const hire of ["Hire a new employee", "توظيف موظف جديد", "Contratar un nuevo empleado", "Embaucher un salarié", "Neuen Mitarbeiter einstellen", "Ansette en ny ansatt"]) {
    expectMatch(hire, "planner", "hiring");
  }
  expectMatch("Onboard a new client", "checklist", "client-onboarding-checklist");
  expectMatch("استقبال عميل جديد", "planner", "generic");
});

test("the onboarding plan for readers in other languages is translated into every one", () => {
  const source = read("lib/start-plan.ts");
  const start = source.indexOf("const CHECKLIST_SUBJECT_PLANS");
  const block = source.slice(start, source.indexOf("\n};", start));
  const strings = [...block.matchAll(/^\s+(?:headline: |intent: )?"([^"]+)",?$/gm)].map((match) => match[1]).filter((text) => !text.endsWith("-checklist"));
  assert.ok(strings.length >= 11, `found ${strings.length} strings`);
  for (const lang of ["nb", "ar", "es", "fr", "de"]) {
    for (const text of strings) assert.ok(translation(lang, text), `${lang} translates "${text}"`);
  }
  assert.match(source, /checklistLanguage\(checklist\) === request\.lang/);
});

test("the first example is closing the month, a process repeated every month", () => {
  assert.deepEqual(GOAL_EXAMPLES[0], { goal: "Close the month's books", expect: { source: "checklist", id: "month-end-close-checklist" } });
  expectMatch("Month-end close", "checklist", "month-end-close-checklist");
  // The end of a month is not, by itself, closing the books.
  expectMatch("A trip at the end of the month", "planner", "travel");
  expectMatch("سفر في نهاية الشهر", "planner", "travel");
});
