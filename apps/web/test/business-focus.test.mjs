import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { getBusinessFocus } from "../lib/business-focus.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const page = readFileSync(join(root, "app/app/business/page.tsx"), "utf8");

test("Business next action prioritizes approvals, then waiting work, active work, and a first mission", () => {
  assert.deepEqual(getBusinessFocus({ pendingApprovals: 2, waitingMissions: 3, activeMissions: 4 }), {
    kind: "approval", count: 2, href: "/app/business/approvals",
  });
  assert.deepEqual(getBusinessFocus({ pendingApprovals: 0, waitingMissions: 3, activeMissions: 4 }), {
    kind: "waiting", count: 3, href: "/app",
  });
  assert.deepEqual(getBusinessFocus({ pendingApprovals: 0, waitingMissions: 0, activeMissions: 4 }), {
    kind: "active", count: 4, href: "/app",
  });
  assert.deepEqual(getBusinessFocus({ pendingApprovals: 0, waitingMissions: 0, activeMissions: 0 }), {
    kind: "start", count: 0, href: "/app/missions/new",
  });
});

test("Business dashboard renders the tested focus state and points the primary action to its next step", () => {
  assert.match(page, /getBusinessFocus\(/);
  assert.match(page, /focus\.kind === "approval"/);
  assert.match(page, /focus\.kind === "waiting"/);
  assert.match(page, /focus\.kind === "active"/);
  assert.match(page, /href=\{focus\.href\}/);
});
