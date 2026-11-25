import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  OWN_TEMPLATE_BOUNDS,
  OWN_TEMPLATE_LIMIT,
  OWN_TEMPLATE_PLANS,
  cleanTemplateName,
  hasOwnTemplates,
  isTemplateId,
  missionFromTemplate,
  templateFromMission,
} from "../lib/own-templates.mjs";
import { parseMissionObjective } from "../lib/mission-content.mjs";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(webRoot, "..", "..");
const read = (path) => readFileSync(join(webRoot, path), "utf8");
const readRepo = (path) => readFileSync(join(repoRoot, path), "utf8");
const MIGRATION = "supabase/migrations/20261124150000_own_templates.sql";

const mission = {
  name: "Open a café",
  intent: "Open on checked facts.",
  criteria: ["Licence in writing", "  ", "Break-even number"],
  actions: [
    { title: "List the licences", status: "COMPLETED" },
    { title: "Dropped idea", status: "CANCELLED" },
    { title: "  Compare three premises  ", status: "PENDING" },
    { title: "   ", status: "PENDING" },
  ],
};

test("only Pro and Scale have own templates; anything else, including errors, is no", () => {
  assert.deepEqual([...OWN_TEMPLATE_PLANS], ["pro", "scale"]);
  for (const plan of ["pro", "scale"]) assert.equal(hasOwnTemplates(plan), true, plan);
  for (const plan of ["free", "plus", "", "PRO", null, undefined, 3]) assert.equal(hasOwnTemplates(plan), false, String(plan));
});

test("a Mission becomes a template of its plan: live steps in order, no status, no proof", () => {
  const made = templateFromMission(mission);
  assert.equal(made.ok, true);
  assert.deepEqual(made.template, {
    name: "Open a café",
    intent: "Open on checked facts.",
    criteria: ["Licence in writing", "Break-even number"],
    actions: ["List the licences", "Compare three premises"],
  });
  assert.equal(templateFromMission(mission, "  My   café\nplan ").template.name, "My café plan", "the given name wins, on one line");
});

test("a Mission that cannot be a template says why", () => {
  assert.deepEqual(templateFromMission({ ...mission, actions: [{ title: "x", status: "CANCELLED" }] }), { ok: false, reason: "no-steps" });
  const many = Array.from({ length: OWN_TEMPLATE_BOUNDS.actions + 1 }, (_, index) => ({ title: `Step ${index}`, status: "PENDING" }));
  assert.deepEqual(templateFromMission({ ...mission, actions: many }), { ok: false, reason: "too-many-steps" });
  assert.equal(templateFromMission({ ...mission, actions: many.slice(0, OWN_TEMPLATE_BOUNDS.actions) }).ok, true, "exactly 50 is allowed");
  assert.deepEqual(templateFromMission({ ...mission, name: "  " }, ""), { ok: false, reason: "no-name" });
});

test("what is saved always fits the database's bounds", () => {
  const long = "x".repeat(5000);
  const made = templateFromMission({
    name: long,
    intent: long,
    criteria: Array.from({ length: 30 }, () => long),
    actions: [{ title: long, status: "PENDING" }],
  });
  assert.equal(made.ok, true);
  assert.equal(made.template.name.length, OWN_TEMPLATE_BOUNDS.name);
  assert.equal(made.template.intent.length, OWN_TEMPLATE_BOUNDS.intent);
  assert.equal(made.template.criteria.length, OWN_TEMPLATE_BOUNDS.criteria);
  assert.ok(made.template.criteria.every((criterion) => criterion.length === OWN_TEMPLATE_BOUNDS.criterion));
  assert.equal(made.template.actions[0].length, OWN_TEMPLATE_BOUNDS.action);
  assert.equal(cleanTemplateName(42), "");
});

test("a Mission started from a template reads back as the same plan", () => {
  const { template } = templateFromMission(mission);
  const created = missionFromTemplate(template);
  assert.deepEqual(created.actions, template.actions);
  assert.notEqual(created.actions, template.actions, "a copy, not the template's own array");
  const parsed = parseMissionObjective(created.objective);
  assert.equal(parsed.name, template.name);
  assert.equal(parsed.intent, template.intent);
  assert.deepEqual(parsed.criteria, template.criteria);
});

test("ids from forms are checked before any query", () => {
  assert.equal(isTemplateId("3cf5604c-1d2e-4f3a-9b8c-7d6e5f4a3b2c"), true);
  for (const bad of ["", "1", "3cf5604c-1d2e-4f3a-9b8c-7d6e5f4a3b2", "' or 1=1 --", null]) assert.equal(isTemplateId(bad), false, String(bad));
});

test("the database is the authority: owner from the session, plan in the policies, the same bounds", () => {
  const sql = readRepo(MIGRATION);
  assert.match(sql, /owner_id uuid not null default auth\.uid\(\)/);
  assert.match(sql, /alter table public\.user_templates enable row level security/);
  // owner_id is never in a column grant, so a client cannot send or change it.
  assert.match(sql, /grant insert \(name, intent, criteria, actions\) on public\.user_templates to authenticated/);
  assert.match(sql, /grant update \(name, intent, criteria, actions\) on public\.user_templates to authenticated/);
  assert.doesNotMatch(sql, /grant (insert|update|all)[^;]*owner_id/i);
  assert.match(sql, /for insert to authenticated\s+with check \(owner_id = auth\.uid\(\) and private\.has_own_templates\(\)\)/);
  assert.match(sql, /for update to authenticated\s+using \(owner_id = auth\.uid\(\)\)\s+with check \(owner_id = auth\.uid\(\) and private\.has_own_templates\(\)\)/);
  assert.match(sql, /for delete to authenticated\s+using \(owner_id = auth\.uid\(\)\)/, "delete needs no plan: the templates are the person's own");
  // The plan check answers only for the caller: no argument to ask about someone else.
  assert.match(sql, /create or replace function private\.has_own_templates\(\)/);
  assert.match(sql, /e\.plan in \('pro', 'scale'\) from public\.ai_entitlements e where e\.user_id = auth\.uid\(\)/);
  assert.match(sql, new RegExp(`>= ${OWN_TEMPLATE_LIMIT} then\\s+raise exception 'TEMPLATE_LIMIT_REACHED'`));
  for (const [column, bound] of [["name", `between 1 and ${OWN_TEMPLATE_BOUNDS.name}`], ["intent", `<= ${OWN_TEMPLATE_BOUNDS.intent}`],
    ["criteria", `cardinality\\(criteria\\) <= ${OWN_TEMPLATE_BOUNDS.criteria} and private\\.texts_within\\(criteria, ${OWN_TEMPLATE_BOUNDS.criterion}\\)`],
    ["actions", `cardinality\\(actions\\) between 1 and ${OWN_TEMPLATE_BOUNDS.actions} and private\\.texts_within\\(actions, ${OWN_TEMPLATE_BOUNDS.action}\\)`]]) {
    assert.match(sql, new RegExp(bound), column);
  }
  // CHECK constraints run as the writer, who must be able to call the helper (found on Development, 24 Nov).
  assert.match(sql, /grant execute on function private\.texts_within\(text\[\], integer\) to authenticated/);
  assert.doesNotMatch(sql, /\b(drop table|drop column|delete from|truncate)\b/i, "additive only");
  assert.match(sql, /revoke all on public\.user_templates from public, anon, authenticated/);
});

test("the CI proof runs the templates checks against the real migrations", () => {
  const workflow = readRepo(".github/workflows/zavqera-opportunity-isolation.yml");
  assert.match(workflow, /\.\/tool\/own_templates_proof\.sh/);
  const proof = readRepo("tool/own_templates_proof.sh");
  for (const check of ["Free cannot save a template", "B reads none of A's templates", "owner_id cannot be written by a client",
    "on Free the template cannot be changed", "on Free the owner can still delete it", "the 101st is refused", "a visitor cannot read templates"]) {
    assert.ok(proof.includes(check), check);
  }
});

test("every action checks the plan before writing and redirects outside its try", () => {
  const actions = read("app/app/templates/actions.ts");
  assert.match(actions, /^"use server";/);
  for (const name of ["saveMissionAsTemplate", "startFromOwnTemplate", "renameOwnTemplate", "deleteOwnTemplate"]) {
    const start = actions.indexOf(`export async function ${name}(`);
    assert.ok(start >= 0, name);
    const next = actions.indexOf("export async function", start + 1);
    const body = actions.slice(start, next === -1 ? undefined : next);
    const catchAt = body.lastIndexOf("} catch");
    assert.ok(catchAt > 0, `${name} catches`);
    assert.doesNotMatch(body.slice(body.indexOf("try {"), catchAt), /redirect\(/, `${name} must not redirect inside try`);
    assert.match(body.slice(catchAt), /redirect\(target\);/, `${name} redirects after the catch`);
    if (name !== "deleteOwnTemplate") assert.match(body, /hasOwnTemplates\(await readCurrentPlan\(\)\)/, `${name} checks the plan`);
  }
  // A Mission becomes a template only if this person can open it in this workspace.
  assert.match(actions, /createSupabaseMissionRepository\(\)\)\.getMission\(missionId\)/);
});

test("an unreadable plan is Free: a feature is never unlocked by an error", () => {
  const repository = read("lib/supabase/own-template-repository.ts");
  assert.match(repository, /const row = await readBillingOverview\(\);\s+return typeof row\?\.plan === "string" \? row\.plan : "free";/);
  // The shared read turns any error into null, which the line above reads as Free.
  const server = read("lib/supabase/server.ts");
  assert.match(server, /if \(result\.error \|\| !Array\.isArray\(result\.data\)\) return null;/);
  assert.match(server, /readBillingOverview = cache\([\s\S]*?\} catch \{\s+return null;\s+\}/);
});

test("the Mission page offers it where it helps, and only where the database exists", () => {
  const page = read("app/app/missions/[id]/page.tsx");
  assert.match(page, /isSupabaseConfigured\(\) \? readCurrentPlan\(\) : Promise\.resolve\("free"\)/);
  assert.match(page, /isSupabaseConfigured\(\) \? \{ active: hasOwnTemplates\(plan\) \} : null/);
  assert.match(page, /<OwnTemplateBox missionId=\{mission\.id\} missionName=\{mission\.name\} active=\{ownTemplates\.active\} notice=\{query\?\.template\} \/>/);
  const box = read("components/own-template-box.tsx");
  assert.match(box, /href="\/pricing"><LocalizedText en="See Pro and Scale"/, "Free and Plus see where it is");
  for (const notice of ["plan", "no-steps", "too-many-steps", "no-name", "limit", "failed"]) assert.match(box, new RegExp(`"?${notice}"?: "`), notice);
  const list = read("app/app/templates/page.tsx");
  assert.match(list, /\{active && <form action=\{startFromOwnTemplate\}>/, "only Pro and Scale start from a template");
  assert.match(list, /<form action=\{deleteOwnTemplate\}/);
});
