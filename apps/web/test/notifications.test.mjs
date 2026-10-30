import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { buildNotificationSummary } from "../lib/notifications.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");
const api = read("app/api/notifications/route.ts");
const page = read("app/app/notifications/page.tsx");
const bell = read("components/notification-bell.tsx");
const approvalCenter = read("components/approval-center.tsx");
const i18n = read("components/localized-text.tsx");

test("notification route uses the scoped repository and returns a private no-store response", () => {
  assert.match(api, /createSupabaseMissionRepository/);
  assert.match(api, /buildNotificationSummary\(missions, approvals\)/);
  assert.match(api, /Authentication required\./);
  assert.match(api, /Cache-Control.*no-store/);
});

test("notification items route directly to missions and the matching approval decision", () => {
  const now = Date.parse("2026-10-10T12:00:00Z");
  const summary = buildNotificationSummary([
    { id: "waiting-1", name: "Waiting mission", status: "WAITING", updated: "2026-10-10T11:30:00Z", actions: [] },
    { id: "active-1", name: "Active mission", status: "ACTIVE", updated: "2026-10-10T10:00:00Z", actions: [
      { id: "overdue", title: "Review the draft", status: "PENDING", followUpAt: "2026-10-10T11:59:59Z" },
      { id: "due-soon", title: "Check the result", status: "RUNNING", followUpAt: "2026-10-17T12:00:00Z" },
      { id: "done", title: "Completed task", status: "COMPLETED", followUpAt: "2026-10-10T11:00:00Z" },
      { id: "cancelled", title: "Cancelled task", status: "CANCELLED", followUpAt: "2026-10-10T11:00:00Z" },
      { id: "outside-window", title: "Later task", status: "PENDING", followUpAt: "2026-10-17T12:00:00.001Z" },
      { id: "invalid-date", title: "Invalid date", status: "PENDING", followUpAt: "not-a-date" },
    ] },
  ], [{
    id: "approval-1",
    createdAt: "2026-10-10T11:00:00Z",
    missionName: "Approval mission",
    actionTitle: "Send a customer email",
  }], now);

  assert.equal(summary.count, 4);
  assert.equal(summary.items.find((item) => item.id === "mission-waiting-1")?.href, "/app/missions/waiting-1");
  const approval = summary.items.find((item) => item.id === "approval-approval-1");
  assert.equal(approval?.href, "/app/business/approvals#approval-approval-1");
  assert.equal(approval?.requiresHumanDecision, true);
  assert.deepEqual(summary.items.find((item) => item.id === "follow-up-overdue"), {
    id: "follow-up-overdue",
    kind: "follow_up",
    title: "Active mission",
    detail: "Overdue: Review the draft",
    href: "/app/missions/active-1",
    dueAt: "2026-10-10T11:59:59Z",
    overdue: true,
  });
  assert.equal(summary.items.find((item) => item.id === "follow-up-due-soon")?.overdue, false);
  assert.equal(summary.items.some((item) => item.id === "follow-up-done"), false);
  assert.equal(summary.items.some((item) => item.id === "follow-up-cancelled"), false);
  assert.equal(summary.items.some((item) => item.id === "follow-up-outside-window"), false);
  assert.equal(summary.items.some((item) => item.id === "follow-up-invalid-date"), false);
});

test("notification center renders separate actionable sections and direct links", () => {
  assert.match(page, /Missions waiting for you/);
  assert.match(page, /Due and overdue tasks/);
  assert.match(page, /Pending approvals/);
  assert.match(page, /\/app\/missions\/\$\{followUp\.missionId\}/);
  assert.match(page, /\/app\/business\/approvals#approval-\$\{approval\.id\}/);
  assert.match(page, /Review this decision/);
  assert.match(page, /Human decision required/);
  assert.match(approvalCenter, /id=\{/);
  assert.match(approvalCenter, /approval-\$\{approval\.id\}/);
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
