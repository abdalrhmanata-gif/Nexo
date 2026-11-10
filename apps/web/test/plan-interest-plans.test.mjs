import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import test from "node:test";

// The pricing page and the database must agree on which plans exist.
//
// record_plan_interest() validates the plan name and returns nothing either
// way, deliberately: a function that answered differently for a known address
// could be used to test whether someone is on the list. The cost of that
// silence is that an unknown plan name is discarded without a word. A card
// added to the page and not to the function would collect addresses, tell the
// visitor "noted", and write nothing — and the first evidence of demand this
// product has ever had would go in the bin.

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(webRoot, "..", "..");

/**
 * Every name the application can submit to record_plan_interest.
 *
 * Read from the call sites rather than the pricing page's own list, because
 * the form is not only on that page: the business page asks for Team the
 * same way. An audit that knew only about pricing would have passed while
 * that one wrote nothing.
 */
function plansTheAppOffers() {
  const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === "node_modules" || entry.name === ".next") return [];
    const full = join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
  const files = ["app", "components"]
    .flatMap((dir) => walk(join(webRoot, dir)))
    .filter((file) => file.endsWith(".tsx"));

  const names = new Set();
  for (const file of files) {
    const body = readFileSync(file, "utf8");
    // <PlanInterest plan="Team" />
    for (const m of body.matchAll(/<PlanInterest\s+plan="([A-Za-z]+)"/g)) names.add(m[1]);
    // <PlanInterest plan={plan.name} /> — the names come from the plan list
    if (/<PlanInterest\s+plan=\{plan\.name\}/.test(body)) {
      for (const m of body.matchAll(/^\s*name:\s*"([A-Za-z]+)",$/gm)) {
        // Free offers a sign-up link, not an interest form.
        if (m[1] !== "Free") names.add(m[1]);
      }
    }
  }
  assert.ok(names.size >= 3, `expected the plans offered, found ${[...names].join(", ")}`);
  return [...names];
}

/** Plans the newest migration of record_plan_interest() accepts. */
function plansTheDatabaseAccepts() {
  const dir = join(repoRoot, "supabase/migrations");
  const migrations = readdirSync(dir)
    .filter((file) => file.endsWith(".sql"))
    .sort();
  let accepted = null;
  for (const file of migrations) {
    const body = readFileSync(join(dir, file), "utf8");
    if (!/create or replace function public\.record_plan_interest/.test(body)) continue;
    const match = /v_plan not in \(([^)]*)\)/.exec(body);
    assert.ok(match, `${file} redefines record_plan_interest without a plan check`);
    accepted = [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  }
  assert.ok(accepted, "no migration defines record_plan_interest");
  return accepted;
}

test("every plan offered on the pricing page is accepted by the database", () => {
  const page = plansTheAppOffers();
  const database = plansTheDatabaseAccepts();
  const unaccepted = page.filter((name) => !database.includes(name));
  assert.deepEqual(unaccepted, [],
    "these plans would collect an address, say it was noted, and store nothing");
});

test("the database accepts no plan the page does not offer", () => {
  // Not a safety problem, but a stale name here means a card was renamed or
  // removed and the function was left behind, which is how the two drift.
  const page = plansTheAppOffers();
  const database = plansTheDatabaseAccepts();
  const orphaned = database.filter((name) => !page.includes(name));
  assert.deepEqual(orphaned, [], "these are accepted by the database but offered nowhere in the app");
});

test("the audit reads both sides, so it cannot pass by finding nothing", () => {
  const page = plansTheAppOffers();
  const database = plansTheDatabaseAccepts();
  assert.ok(page.includes("Plus") && page.includes("Pro"),
    `the call-site parser lost the known plans: ${page.join(", ")}`);
  assert.ok(database.includes("Plus") && database.includes("Pro"),
    `the migration parser lost the known plans: ${database.join(", ")}`);
});
