import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");
const api = read("app/api/notifications/route.ts");
const page = read("app/app/notifications/page.tsx");
const bell = read("components/notification-bell.tsx");
const i18n = read("components/localized-text.tsx");

test("notification API reports waiting missions, approvals, and due/overdue follow-up actions", () => {
  assert.match(api, /mission\.status === "WAITING"/);
  assert.match(api, /listPendingApprovals/);
  assert.match(api, /action\.followUpAt/);
  assert.match(api, /action\.status === "COMPLETED"/);
  assert.match(api, /action\.status === "CANCELLED"/);
  assert.match(api, /7 \* 24 \* 60 \* 60 \* 1000/);
  assert.match(api, /followUpWindow/);
  assert.match(api, /count: waiting\.length \+ approvals\.length \+ followUps\.length/);
  assert.match(api, /Cache-Control.*no-store/);
});

test("notification center renders separate actionable sections and direct links", () => {
  assert.match(page, /Missions waiting for you/);
  assert.match(page, /Due and overdue tasks/);
  assert.match(page, /Pending approvals/);
  assert.match(page, /\/app\/missions\/\$\{followUp\.missionId\}/);
  assert.match(page, /\/app\/business\/approvals#approval-\$\{approval\.id\}/);
  assert.match(page, /Review this decision/);
  assert.match(page, /Human decision required/);
});

test("notification bell only polls inside Business routes, never on home or personal workspace", () => {
  assert.match(bell, /const inBusinessWorkspace = pathname === "\/app\/business" \|\| pathname\.startsWith\("\/app\/business\/"\)/);
  assert.match(bell, /if \(!inBusinessWorkspace\) return/);
  assert.match(bell, /setInterval/);
  assert.match(bell, /Cache-Control|cache: "no-store"/);
  assert.doesNotMatch(bell, /pathname === "\/app" \|\| pathname\.startsWith\("\/app\/"\)/);
});

test("notification labels include Arabic, Norwegian, Spanish, French and German translations", () => {
  for (const key of ["Due and overdue tasks", "Overdue", "Due within 7 days", "Open task"]) {
    assert.match(i18n, new RegExp(`"${key.replace(/[.*+?^${}()|[\]\\\\]/g, "\\\\$&")}":`));
  }
  assert.match(page, /ar="المهام المستحقة والمتأخرة"/);
});
