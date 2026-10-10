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
