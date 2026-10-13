import assert from "node:assert/strict";
import test from "node:test";
import { runMissionActionWorker } from "../lib/mission-authority/mission-action-worker-boundary.mjs";

test("missing adapter causes zero privileged-client construction and zero provider calls", async () => {
  const calls = { client: 0, dispatch: 0, reconcile: 0 };
  const result = await runMissionActionWorker({
    audience: "provider.send.v1",
    operation: "dispatch",
    executionId: "d3d61c35-1f9d-4c97-9310-e125f9e7f1c1",
    resolveAdapter: () => null,
    createClient() { calls.client++; throw new Error("unexpected privileged client"); },
    dispatch() { calls.dispatch++; throw new Error("unexpected provider dispatch"); },
    reconcile() { calls.reconcile++; throw new Error("unexpected provider reconciliation"); },
  });
  assert.deepEqual(result, { kind: "missing_adapter" });
  assert.deepEqual(calls, { client: 0, dispatch: 0, reconcile: 0 });
});

test("adapter resolution precedes client construction and gateway invocation", async () => {
  const events = [];
  const adapter = {
    audience: "provider.send.v1",
    dispatch: async () => ({}),
    reconcile: async () => ({}),
  };
  const result = await runMissionActionWorker({
    audience: adapter.audience,
    operation: "dispatch",
    executionId: "d3d61c35-1f9d-4c97-9310-e125f9e7f1c1",
    resolveAdapter() { events.push("resolve"); return adapter; },
    createClient() { events.push("client"); return {}; },
    async dispatch({ adapter: actual }) { events.push("dispatch"); assert.equal(actual, adapter); return { decision: "DISPATCHED" }; },
    async reconcile() { events.push("reconcile"); return {}; },
  });
  assert.deepEqual(events, ["resolve", "client", "dispatch"]);
  assert.deepEqual(result, { kind: "completed", result: { decision: "DISPATCHED" } });
});

test("missing reconciliation capability fails before client construction", async () => {
  const events = [];
  const result = await runMissionActionWorker({
    audience: "provider.send.v1",
    operation: "reconcile",
    executionId: "d3d61c35-1f9d-4c97-9310-e125f9e7f1c1",
    resolveAdapter: () => ({ audience: "provider.send.v1", dispatch: async () => ({}) }),
    createClient() { events.push("client"); return {}; },
    async dispatch() { events.push("dispatch"); return {}; },
    async reconcile() { events.push("reconcile"); return {}; },
  });
  assert.deepEqual(result, { kind: "missing_reconciliation" });
  assert.deepEqual(events, []);
});
test("missing dispatch capability fails closed before privileged-client construction", async () => {
  const calls = { client: 0, dispatch: 0, reconcile: 0 };
  const result = await runMissionActionWorker({
    audience: "provider.send.v1",
    operation: "dispatch",
    executionId: "d3d61c35-1f9d-4c97-9310-e125f9e7f1c1",
    resolveAdapter: () => ({ audience: "provider.send.v1", reconcile: async () => ({}) }),
    createClient() { calls.client++; throw new Error("unexpected privileged client"); },
    dispatch() { calls.dispatch++; throw new Error("unexpected provider dispatch"); },
    reconcile() { calls.reconcile++; throw new Error("unexpected provider reconciliation"); },
  });
  assert.deepEqual(result, { kind: "missing_dispatch" });
  assert.deepEqual(calls, { client: 0, dispatch: 0, reconcile: 0 });
});

test("invalid operation is rejected before adapter resolution or privileged-client construction", async () => {
  const calls = { resolve: 0, client: 0, dispatch: 0, reconcile: 0 };
  const result = await runMissionActionWorker({
    audience: "provider.send.v1",
    operation: "delete",
    executionId: "d3d61c35-1f9d-4c97-9310-e125f9e7f1c1",
    resolveAdapter() { calls.resolve++; return null; },
    createClient() { calls.client++; throw new Error("unexpected privileged client"); },
    dispatch() { calls.dispatch++; throw new Error("unexpected provider dispatch"); },
    reconcile() { calls.reconcile++; throw new Error("unexpected provider reconciliation"); },
  });
  assert.deepEqual(result, { kind: "invalid_operation" });
  assert.deepEqual(calls, { resolve: 0, client: 0, dispatch: 0, reconcile: 0 });
});

test("adapter audience mismatch fails closed before privileged-client construction", async () => {
  const calls = { client: 0, dispatch: 0, reconcile: 0 };
  const result = await runMissionActionWorker({
    audience: "provider.send.v1",
    operation: "dispatch",
    executionId: "d3d61c35-1f9d-4c97-9310-e125f9e7f1c1",
    resolveAdapter: () => ({ audience: "provider.delete.v1", reconcile: async () => ({}) }),
    createClient() { calls.client++; throw new Error("unexpected privileged client"); },
    dispatch() { calls.dispatch++; throw new Error("unexpected provider dispatch"); },
    reconcile() { calls.reconcile++; throw new Error("unexpected provider reconciliation"); },
  });
  assert.deepEqual(result, { kind: "missing_adapter" });
  assert.deepEqual(calls, { client: 0, dispatch: 0, reconcile: 0 });
});
