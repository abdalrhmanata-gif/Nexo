import assert from "node:assert/strict";
import test from "node:test";
import { AI_GENERATION_OUTCOMES, runAiGeneration } from "../lib/ai-generation-service.mjs";

function fakes({ reserveResult = {
  allowed: true,
  reservation_id: "reservation-1",
}, generate, consume, release } = {}) {
  const calls = { reserve: [], generate: 0, consume: [], release: [] };
  return {
    calls,
    reserve: async (requestId) => {
      calls.reserve.push(requestId);
      return reserveResult;
    },
    generate: async () => {
      calls.generate += 1;
      return generate ? await generate() : { summary: "ok", steps: [] };
    },
    consume: async (id) => {
      calls.consume.push(id);
      await consume?.();
    },
    release: async (id) => {
      calls.release.push(id);
      await release?.();
    },
  };
}

test("definite provider rejection releases the reservation exactly once", async () => {
  const fake = fakes({
    generate: async () => { throw new Error("RATE_LIMITED"); },
  });

  const result = await runAiGeneration({
    requestId: "request-1",
    ...fake,
  });

  assert.equal(result.kind, AI_GENERATION_OUTCOMES.PROVIDER_ERROR);
  assert.equal(result.disposition, "release");
  assert.equal(result.status, 429);
  assert.deepEqual(fake.calls.release, ["reservation-1"]);
  assert.deepEqual(fake.calls.consume, []);
});

test("provider timeout/transport uncertainty does not release the reservation", async () => {
  const fake = fakes({
    generate: async () => { throw new Error("This could be a timeout after dispatch"); },
  });

  const result = await runAiGeneration({
    requestId: "request-unknown",
    ...fake,
  });

  assert.equal(result.kind, AI_GENERATION_OUTCOMES.PROVIDER_ERROR);
  assert.equal(result.disposition, "hold");
  assert.equal(result.code, "PROVIDER_OUTCOME_UNKNOWN");
  assert.equal(result.status, 504);
  assert.deepEqual(fake.calls.release, []);
  assert.deepEqual(fake.calls.consume, []);
});

test("provider success with quota settlement failure never releases the reservation", async () => {
  const fake = fakes({
    consume: async () => { throw new Error("AI_USAGE_UNAVAILABLE"); },
  });

  const result = await runAiGeneration({
    requestId: "request-settlement",
    ...fake,
  });

  assert.equal(result.kind, AI_GENERATION_OUTCOMES.SETTLEMENT_FAILED);
  assert.deepEqual(fake.calls.consume, ["reservation-1"]);
  assert.deepEqual(fake.calls.release, []);
});

test("successful generation consumes the reservation and never releases it", async () => {
  const fake = fakes();

  const result = await runAiGeneration({
    requestId: "request-success",
    ...fake,
  });

  assert.equal(result.kind, AI_GENERATION_OUTCOMES.SUCCESS);
  assert.deepEqual(result.plan, { summary: "ok", steps: [] });
  assert.deepEqual(fake.calls.consume, ["reservation-1"]);
  assert.deepEqual(fake.calls.release, []);
});

test("quota denial never calls the provider or settlement functions", async () => {
  const fake = fakes({
    reserveResult: {
      allowed: false,
      reservation_id: null,
      monthly_limit: 20,
      generations_used: 20,
      remaining: 0,
    },
  });

  const result = await runAiGeneration({
    requestId: "request-quota",
    ...fake,
  });

  assert.equal(result.kind, AI_GENERATION_OUTCOMES.QUOTA);
  assert.equal(fake.calls.generate, 0);
  assert.deepEqual(fake.calls.consume, []);
  assert.deepEqual(fake.calls.release, []);
});
