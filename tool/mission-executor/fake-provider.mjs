import { createHash } from "node:crypto";
import http from "node:http";

const PORT = 9090;
const MAX_BODY_BYTES = 16 * 1024;
const EXPECTED_AUDIENCE = "fake.external.v1";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const receiptsByIdempotencyKey = new Map();
const requestsByScenario = new Map();
const scenarioByIdempotencyKey = new Map();
const reconciliationsByIdempotencyKey = new Map();
const acceptedTimeoutKeys = new Set();
const tamperedReconciliationKeys = new Set();

function send(response, status, body) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error("body too large"), { statusCode: 413 });
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw Object.assign(new Error("invalid JSON"), { statusCode: 400 });
  }
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function hasExactKeys(value, expectedFields) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort();
  const expected = [...expectedFields].sort();
  return keys.length === expected.length && keys.every((key, index) => key === expected[index]);
}

function isSha256(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function scenarioOf(value) {
  const scenario = value?.payload?.__contractTestScenario;
  return typeof scenario === "string" ? scenario : "normal";
}

function receiptMatches(receipt, envelope) {
  return receipt
    && receipt.provider === "fake-provider-only"
    && receipt.providerAccount === "fake-account-v1"
    && receipt.executionId === envelope.executionId
    && receipt.audience === envelope.audience
    && receipt.idempotencyKey === envelope.idempotencyKey
    && receipt.payloadDigest === envelope.payloadDigest;
}

async function handleReconciliation(request, response) {
  const envelope = await readJson(request);
  const expectedKeys = ["audience", "executionId", "idempotencyKey", "payloadDigest"];
  if (!hasExactKeys(envelope, expectedKeys)) {
    send(response, 400, { error: "unexpected reconciliation fields" });
    return;
  }
  if (envelope.audience !== EXPECTED_AUDIENCE
    || typeof envelope.executionId !== "string"
    || !UUID_PATTERN.test(envelope.executionId)
    || typeof envelope.idempotencyKey !== "string"
    || envelope.idempotencyKey.trim() === ""
    || envelope.idempotencyKey.length > 128
    || !isSha256(envelope.payloadDigest)) {
    send(response, 403, { error: "reconciliation request denied" });
    return;
  }

  reconciliationsByIdempotencyKey.set(
    envelope.idempotencyKey,
    (reconciliationsByIdempotencyKey.get(envelope.idempotencyKey) ?? 0) + 1,
  );
  // Hold one fake lookup open so two different reconciliation responses overlap.
  // This deliberately tests that the gateway does not keep a shared response writer.
  if (scenarioByIdempotencyKey.get(envelope.idempotencyKey) === "slow-reconcile") {
    await delay(500);
  }
  const prior = receiptsByIdempotencyKey.get(envelope.idempotencyKey);
  if (!prior) {
    send(response, 200, { found: false, state: "NOT_FOUND" });
    return;
  }
  if (!receiptMatches(prior, envelope)) {
    send(response, 409, { error: "reconciliation binding mismatch" });
    return;
  }

  if (scenarioByIdempotencyKey.get(envelope.idempotencyKey) === "reconcile-receipt-mismatch"
    && !tamperedReconciliationKeys.has(envelope.idempotencyKey)) {
    tamperedReconciliationKeys.add(envelope.idempotencyKey);
    send(response, 200, { found: true, receipt: { ...prior, audience: "fake.other.v1" } });
    return;
  }

  send(response, 200, { found: true, receipt: prior });
}

const server = http.createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/health") {
    send(response, 200, { ok: true, mode: "fake-provider-only" });
    return;
  }

  // Private observability endpoint for the disposable test harness only.
  // The isolated executor cannot reach this endpoint directly.
  if (request.method === "GET" && request.url === "/__test/metrics") {
    send(response, 200, {
      requestCount: [...requestsByScenario.values()].reduce((sum, count) => sum + count, 0),
      receiptCount: receiptsByIdempotencyKey.size,
      requestsByScenario: Object.fromEntries([...requestsByScenario.entries()].sort(([a], [b]) => a.localeCompare(b))),
      reconciliationCount: [...reconciliationsByIdempotencyKey.values()].reduce((sum, count) => sum + count, 0),
      reconciliationsByIdempotencyKey: Object.fromEntries([...reconciliationsByIdempotencyKey.entries()].sort(([a], [b]) => a.localeCompare(b))),
    });
    return;
  }

  if (request.method === "POST" && request.url === "/v1/reconcile") {
    try {
      await handleReconciliation(request, response);
    } catch (error) {
      send(response, Number.isInteger(error?.statusCode) ? error.statusCode : 400, {
        error: error?.statusCode === 413 ? "body too large" : "invalid reconciliation request",
      });
    }
    return;
  }

  if (request.method !== "POST" || request.url !== "/v1/actions") {
    send(response, 404, { error: "not found" });
    return;
  }

  try {
    const value = await readJson(request);
    const expectedKeys = ["audience", "executionId", "idempotencyKey", "payload", "payloadDigest"];
    if (!hasExactKeys(value, expectedKeys)) {
      send(response, 400, { error: "unexpected provider request fields" });
      return;
    }
    if (value.audience !== EXPECTED_AUDIENCE
      || typeof value.executionId !== "string"
      || !UUID_PATTERN.test(value.executionId)
      || typeof value.idempotencyKey !== "string"
      || value.idempotencyKey.trim() === ""
      || value.idempotencyKey.length > 128
      || !value.payload
      || typeof value.payload !== "object"
      || Array.isArray(value.payload)
      || !isSha256(value.payloadDigest)) {
      send(response, 403, { error: "provider request denied" });
      return;
    }
    const digest = createHash("sha256").update(JSON.stringify(value.payload)).digest("hex");
    if (digest !== value.payloadDigest) {
      send(response, 403, { error: "payload digest mismatch" });
      return;
    }

    const scenario = scenarioOf(value);
    requestsByScenario.set(scenario, (requestsByScenario.get(scenario) ?? 0) + 1);
    scenarioByIdempotencyKey.set(value.idempotencyKey, scenario);

    const prior = receiptsByIdempotencyKey.get(value.idempotencyKey);
    if (prior) {
      if (prior.executionId !== value.executionId
        || prior.audience !== value.audience
        || prior.payloadDigest !== value.payloadDigest) {
        send(response, 409, { error: "idempotency binding mismatch" });
        return;
      }
      send(response, 200, { ok: true, replayed: true, receipt: prior });
      return;
    }

    // Failure-before-acceptance scenarios are deliberately test-only.
    if (scenario === "provider-429") {
      send(response, 429, { error: "simulated provider rate limit" });
      return;
    }
    if (scenario === "provider-500") {
      send(response, 500, { error: "simulated provider failure" });
      return;
    }

    const receipt = Object.freeze({
      provider: "fake-provider-only",
      providerAccount: "fake-account-v1",
      externalId: "fake-" + value.idempotencyKey,
      executionId: value.executionId,
      audience: value.audience,
      idempotencyKey: value.idempotencyKey,
      payloadDigest: value.payloadDigest,
    });
    receiptsByIdempotencyKey.set(value.idempotencyKey, receipt);

    // Simulate accepted work whose response is lost. Reconciliation discovers
    // the existing receipt without submitting a second dispatch request.
    if (scenario === "accepted-then-timeout" && !acceptedTimeoutKeys.has(value.idempotencyKey)) {
      acceptedTimeoutKeys.add(value.idempotencyKey);
      request.socket.destroy();
      return;
    }

    if (scenario === "missing-receipt") {
      send(response, 200, { ok: true, replayed: false });
      return;
    }
    if (scenario === "malformed-receipt") {
      send(response, 200, { ok: true, replayed: false, receipt: { provider: receipt.provider, externalId: receipt.externalId } });
      return;
    }
    if (scenario === "receipt-binding-mismatch") {
      send(response, 200, { ok: true, replayed: false, receipt: { ...receipt, audience: "fake.other.v1" } });
      return;
    }

    if (scenario === "delayed-success") {
      await delay(700);
    }

    send(response, 200, { ok: true, replayed: false, receipt });
  } catch (error) {
    send(response, Number.isInteger(error?.statusCode) ? error.statusCode : 400, {
      error: error?.statusCode === 413 ? "body too large" : "invalid request",
    });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  process.stdout.write("fake provider listening on " + PORT + "\n");
});

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
