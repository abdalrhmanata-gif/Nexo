import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import test from "node:test";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => readFileSync(join(webRoot, relative), "utf8");
const page = read("app/app/business/page.tsx");
const css = read("app/globals.css");

test("Business workspace opts into its dedicated responsive dashboard layout", () => {
  assert.match(page, /className="container business-dashboard"/);
  assert.match(css, /\.business-dashboard\s*\{[^}]*width:\s*min\(1320px,\s*calc\(100%\s*-\s*48px\)\)/s);
});

test("Business metrics have desktop, tablet, and mobile layouts", () => {
  assert.match(css, /\.business-dashboard \.stats\s*\{\s*grid-template-columns:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /@media\s*\(max-width:\s*1100px\)/);
  assert.match(css, /@media\s*\(max-width:\s*760px\)/);
  assert.match(css, /@media\s*\(max-width:\s*380px\)/);
  assert.match(css, /\.business-dashboard \.stats\s*\{\s*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /\.business-dashboard \.stats\s*\{\s*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /\.business-dashboard \.stats\s*\{\s*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*;/);
});

test("Business cards collapse to one readable column on mobile", () => {
  assert.match(css, /@media\s*\(max-width:\s*760px\)\s*\{[\s\S]*?\.business-dashboard \.grid\s*\{\s*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.match(css, /\.business-dashboard \.card p,\s*\.business-dashboard \.card li\s*\{\s*overflow-wrap:\s*anywhere\s*;/);
});

test("mobile navigation keeps the brand first and uses a predictable two-column grid", () => {
  assert.match(css, /@media\s*\(max-width:\s*700px\)\s*\{[\s\S]*?\.topbar\s*\{[\s\S]*?flex-direction:\s*column/);
  assert.match(css, /\.topbar\s*>\s*nav\s*\{[\s\S]*?display:\s*grid[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /\.topbar\s*>\s*nav\s*>\s*\.language-switcher\s*select\s*\{[\s\S]*?width:\s*100%/);
});


test("notification bell and center reflect missions waiting for input and pending approvals", () => {
  const bell = read("components/notification-bell.tsx");
  const api = read("app/api/notifications/route.ts");
  const page = read("app/app/notifications/page.tsx");
  const shell = read("components/shell.tsx");
  assert.match(shell, /NotificationBell/);
  assert.match(bell, /fetch\("\/api\/notifications"/);
  assert.match(bell, /setInterval/);
  assert.match(api, /mission\.status === "WAITING"/);
  assert.match(api, /listPendingApprovals/);
  assert.match(page, /Missions waiting for you/);
  assert.match(page, /Pending approvals/);
});

test("Business and Templates use the shared darker brand hierarchy", () => {
  const templates = read("app/templates/page.tsx");
  assert.match(templates, /className="container templates-page"/);
  assert.match(templates, /template-hero-panel/);
  assert.match(css, /\.templates-page \.template-hero-panel[\s\S]*?background:\s*linear-gradient/);
  assert.match(css, /\.business-dashboard \.card[\s\S]*?border-top:\s*3px solid var\(--navy\)/);
});

test("Business copy and mission template library are wired to localization", () => {
  const templates = read("app/templates/page.tsx");
  const dictionary = read("components/localized-text.tsx");
  assert.match(page, /<LocalizedText en="Run AI work as a team"/);
  assert.match(page, /<LocalizedText en="Team access and roles"/);
  assert.match(templates, /<LocalizedText en=\{template\.title\}/);
  assert.match(templates, /<LocalizedText en=\{template\.goal\}/);
  assert.match(dictionary, /"Run AI work as a team":/);
  assert.match(dictionary, /"Plan a family trip":/);
  assert.match(dictionary, /"Describe the outcome you want\.":/);
});


test("mission templates provide a direct try link and a native-share/copy growth loop", () => {
  const templates = read("app/templates/page.tsx");
  const share = read("components/share-template-button.tsx");
  assert.match(templates, /ShareTemplateButton/);
  assert.match(templates, /\/try\?template=/);
  assert.match(share, /navigator\.share/);
  assert.match(share, /navigator\.clipboard\.writeText/);
  assert.match(share, /url\.searchParams\.set\("template", templateId\)/);
});

test("notification bell is only active inside the authenticated workspace", () => {
  const bell = read("components/notification-bell.tsx");
  const api = read("app/api/notifications/route.ts");
  assert.match(bell, /const inWorkspace = pathname === "\/app" \|\| pathname\.startsWith\("\/app\/"\)/);
  assert.match(bell, /if \(!inWorkspace\) return null/);
  assert.match(bell, /useEffect\(\(\) => \{\s*if \(!inWorkspace\) return/s);
  assert.match(api, /status: 401/);
  assert.match(api, /Authentication is required\./);
});

test("Business owner metric uses persisted member data rather than a hard-coded fallback", () => {
  assert.match(page, /members\.filter\(\(member\) => member\.role === "owner"\)\.length/);
  assert.doesNotMatch(page, /members\.filter\(\(member\) => member\.role === "owner"\)\.length \|\| 1/);
});

test("mission cards route next-step states through the shared localization dictionary", () => {
  const missionCard = read("components/mission-card.tsx");
  assert.match(missionCard, /<LocalizedText en=\{next\.label\}/);
  assert.match(missionCard, /<LocalizedText en=\{next\.detail\}/);
  assert.match(missionCard, /actions complete/);
});


test("Business, Templates, and dynamic workspace states have Norwegian and Arabic translations", () => {
  const dictionary = read("components/localized-text.tsx");
  for (const englishKey of [
    "Run AI work as a team",
    "Workspace owner",
    "Active missions",
    "Needs approval/input",
    "Shared mission workspace",
    "Plan a family trip",
    "Find three family-friendly hotels in Copenhagen for three nights under €600. Compare location, room suitability, and total price. Do not book or pay.",
    "Prepare lead follow-up",
    "Share template",
    "Link copied",
    "Invitation accepted",
    "PENDING",
    "A human decision is needed before this action can proceed.",
    "Your mission draft is ready.",
    "Provide a valid email address and role.",
    "An invitation is already pending for this email.",
    "This user is already a workspace member.",
    "Only a workspace owner or admin can invite teammates.",
    "The invitation could not be created.",
    "The email provider rejected the invitation. Check the sender configuration and try again.",
    "The email provider rejected the invitation. Check the sender configuration and try again. The pending invitation could not be cleared; revoke it in Business before retrying.",
    "We could not confirm whether the email provider accepted this invitation. Check provider logs before retrying; revoke the pending invitation in Business only if it was not sent.",
    "Secure invitation links are not configured for this deployment yet.",
    "The invitation request could not be processed.",
  ]) {
    const escaped = englishKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(dictionary, new RegExp(`"${escaped}": \\{ nb: "[^"]+", ar: "[^"]+"`), `missing nb/ar translation for: ${englishKey}`);
  }
});


test("Business and Templates navigation are intentionally prominent", () => {
  const shell = read("components/shell.tsx");
  assert.match(shell, /className="nav-featured nav-business" href="\/app\/business"/);
  assert.match(shell, /className="nav-featured nav-templates" href="\/templates"/);
  assert.match(css, /\.topbar > nav > \.nav-business/);
  assert.match(css, /\.topbar > nav > \.nav-templates/);
  assert.match(css, /@media \(max-width:700px\)[\s\S]*?\.hero-actions \.button \{ width:100%/);
});

test("landing copy emphasizes bounded delegation and makes templates a primary discovery path", () => {
  const home = read("app/page.tsx");
  assert.match(home, /Give AI a mission\. Keep control of the outcome\./);
  assert.match(home, /delegate to AI without handing over the keys/);
  assert.match(home, /Explore mission templates/);
  assert.match(home, /Skip the blank page\. Start with a proven pattern\./);
});
