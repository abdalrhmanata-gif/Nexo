import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");

test("product growth tracking accepts only authenticated template-share signals", () => {
  const route = read("app/api/product-events/route.ts");
  assert.match(route, /supabase\.auth\.getUser\(\)/);
  assert.match(route, /input\.event_type !== "template_shared"/);
  assert.match(route, /missionTemplateById\(input\.template_id\)/);
  assert.doesNotMatch(route, /service_role/i);
});

test("template share signals are sent only after successful sharing or copying", () => {
  const share = read("components/share-template-button.tsx");
  assert.match(share, /\/api\/product-events/);
  assert.match(share, /recordShare\(\)/);
  assert.match(share, /navigator\.share/);
  assert.match(share, /navigator\.clipboard\.writeText/);
  assert.match(share, /searchParams\.set\("template", templateId\)/);
});

test("repeat-mission measurement is database-triggered and content-minimal", () => {
  const migration = read("../../supabase/migrations/20261010110509_w55_product_growth_signals.sql");
  assert.match(migration, /after insert on public\.missions/);
  assert.match(migration, /owned_mission_count >= 2/);
  assert.match(migration, /second_mission_created/);
  assert.match(migration, /enable row level security/);
  assert.doesNotMatch(migration, /create table[\s\S]*?\b(goal|intent|prompt|email|ip_address)\b/i);
});

test("shared template preview overrides stale anonymous plans without signup", () => {
  const form = read("components/anonymous-plan-form.tsx");
  const page = read("app/try/page.tsx");
  assert.match(form, /const template = missionTemplateById\(templateId\)/);
  assert.match(form, /if \(template\)[\s\S]*setGoal\(template\.goal\)[\s\S]*sessionStorage\.removeItem\(DRAFT_KEY\)/);
  assert.match(page, /No signup needed/);
  assert.match(form, /Create account & save/);
});
