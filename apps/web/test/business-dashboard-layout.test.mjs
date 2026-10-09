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
