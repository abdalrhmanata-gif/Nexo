import { createHash } from "node:crypto";
import http from "node:http";

const PORT = 9090;
const MAX_BODY_BYTES = 16 * 1024;
const EXPECTED_AUDIENCE = "fake.external.v1";
const receiptsByIdempotencyKey = new Map();
const requestsByScenario = new Map();
const acceptedTimeoutKeys = new Set();

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

function scenarioOf(value) {
  const scenario = value?.payload?.__contractTestScenario;
  return typeof scenario === "string" ? scenario : "normal";
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
    });
    return;
  }

  if (request.method !== "POST" || request.url !== "/v1/actions") {
    send(response, 404, { error: "not found" });
    return;
  }

  try {
    const value = await readJson(request);
    const expectedKeys = ["audience", "executionId", "idempotencyKey", "payload", "payloadDigest"].sort();
    const keys = value && typeof value === "object" && !Array.isArray(value) ? Object.keys(value).sort() : [];
    if (keys.length !== expectedKeys.length || keys.some((key, index) => key !== expectedKeys[index])) {
      send(response, 400, { error: "unexpected provider request fields" });
      return;
    }
    if (value.audience !== EXPECTED_AUDIENCE
      || typeof value.executionId !== "string"
      || !/^[0-9a-f-]{36}$/i.test(value.executionId)
      || typeof value.idempotencyKey !== "string"
      || value.idempotencyKey.trim() === ""
      || value.idempotencyKey.length > 128
      || !value.payload
      || typeof value.payload !== "object"
      || Array.isArray(value.payload)
      || typeof value.payloadDigest !== "string"
      || !/^[a-f0-9]{64}$/.test(value.payloadDigest)) {
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

    // Simulate accepted work whose response is lost. An exact replay can recover
    // the already-recorded receipt; the fake provider must not create a second one.
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
