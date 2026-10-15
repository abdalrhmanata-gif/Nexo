import { createHash } from "node:crypto";
import http from "node:http";

const PORT = 8080;
const MAX_BODY_BYTES = 16 * 1024;
const EXPECTED_AUDIENCE = "fake.external.v1";
// Fixed test-only upstreams. Never derived from request data.
const FAKE_PROVIDER_URL = "http://fake-provider:9090/v1/actions";
const FAKE_PROVIDER_RECONCILE_URL = "http://fake-provider:9090/v1/reconcile";
const EXPECTED_KEYS = ["audience", "executionId", "expiresAt", "idempotencyKey", "payload", "payloadDigest"];
const EXPECTED_RECONCILE_KEYS = ["audience", "executionId", "idempotencyKey", "payloadDigest"];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

function hasExactKeys(value, expectedFields) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort();
  const expected = [...expectedFields].sort();
  return keys.length === expected.length && keys.every((key, index) => key === expected[index]);
}

function isSha256(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function receiptMatches(receipt, envelope) {
  return receipt
    && receipt.provider === "fake-provider-only"
    && receipt.providerAccount === "fake-account-v1"
    && receipt.executionId === envelope.executionId
    && receipt.audience === envelope.audience
    && receipt.idempotencyKey === envelope.idempotencyKey
    && receipt.payloadDigest === envelope.payloadDigest
    && typeof receipt.externalId === "string"
    && receipt.externalId.length > 0;
}

function validReconciliationEnvelope(value) {
  return hasExactKeys(value, EXPECTED_RECONCILE_KEYS)
    && value.audience === EXPECTED_AUDIENCE
    && typeof value.executionId === "string"
    && UUID_PATTERN.test(value.executionId)
    && typeof value.idempotencyKey === "string"
    && value.idempotencyKey.trim() !== ""
    && value.idempotencyKey.length <= 128
    && isSha256(value.payloadDigest);
}

async function reconcile(envelope) {
  let providerResponse;
  try {
    providerResponse = await fetch(FAKE_PROVIDER_RECONCILE_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        executionId: envelope.executionId,
        audience: envelope.audience,
        idempotencyKey: envelope.idempotencyKey,
        payloadDigest: envelope.payloadDigest,
      }),
      signal: AbortSignal.timeout(2_000),
    });
  } catch {
    send(reconcile.response, 502, { error: "provider reconciliation outcome unknown; inspect before retrying" });
    return;
  }

  if (providerResponse.status === 409) {
    await providerResponse.arrayBuffer();
    send(reconcile.response, 409, { error: "provider reconciliation binding mismatch" });
    return;
  }
  if (!providerResponse.ok) {
    await providerResponse.arrayBuffer();
    send(reconcile.response, 502, { error: "provider reconciliation could not be verified" });
    return;
  }

  let providerResult;
  try {
    providerResult = await providerResponse.json();
  } catch {
    send(reconcile.response, 502, { error: "malformed provider reconciliation response" });
    return;
  }
  if (providerResult?.found === false && providerResult.state === "NOT_FOUND") {
    // NOT_FOUND is not asserted as proof of NOT_SENT; no dispatch retry is performed here.
    send(reconcile.response, 200, { ok: true, state: "NOT_FOUND" });
    return;
  }
  if (providerResult?.found === true && receiptMatches(providerResult.receipt, envelope)) {
    send(reconcile.response, 200, { ok: true, state: "FOUND", receipt: providerResult.receipt });
    return;
  }
  send(reconcile.response, 502, { error: "fake provider reconciliation receipt binding mismatch" });
}

const server = http.createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/health") {
    send(response, 200, { ok: true, mode: "fake-only" });
    return;
  }

  if (request.method === "POST" && request.url === "/v1/reconcile") {
    let envelope;
    try {
      envelope = await readJson(request);
    } catch (error) {
      send(response, Number.isInteger(error?.statusCode) ? error.statusCode : 400, {
        error: error?.statusCode === 413 ? "body too large" : "invalid reconciliation request",
      });
      return;
    }
    if (!validReconciliationEnvelope(envelope)) {
      send(response, 400, { error: "only a valid, bound reconciliation request is accepted" });
      return;
    }
    // Bind the response writer to this invocation without passing it to a provider.
    reconcile.response = response;
    try {
      await reconcile(envelope);
    } catch {
      send(response, 502, { error: "provider reconciliation could not be verified" });
    } finally {
      delete reconcile.response;
    }
    return;
  }

  if (request.method !== "POST" || request.url !== "/v1/execute") {
    send(response, 404, { error: "not found" });
    return;
  }

  try {
    const envelope = await readJson(request);
    if (!hasExactKeys(envelope, EXPECTED_KEYS)) {
      send(response, 400, { error: "unexpected envelope fields" });
      return;
    }
    if (envelope.audience !== EXPECTED_AUDIENCE
      || typeof envelope.executionId !== "string"
      || !UUID_PATTERN.test(envelope.executionId)
      || typeof envelope.idempotencyKey !== "string"
      || envelope.idempotencyKey.trim() === ""
      || envelope.idempotencyKey.length > 128
      || !Number.isFinite(Date.parse(envelope.expiresAt))
      || Date.parse(envelope.expiresAt) <= Date.now()
      || !envelope.payload
      || typeof envelope.payload !== "object"
      || Array.isArray(envelope.payload)
      || !isSha256(envelope.payloadDigest)) {
      send(response, 403, { error: "envelope denied" });
      return;
    }

    const digest = createHash("sha256").update(JSON.stringify(envelope.payload)).digest("hex");
    if (digest !== envelope.payloadDigest) {
      send(response, 403, { error: "payload digest mismatch" });
      return;
    }

    let providerResponse;
    try {
      providerResponse = await fetch(FAKE_PROVIDER_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          executionId: envelope.executionId,
          audience: envelope.audience,
          idempotencyKey: envelope.idempotencyKey,
          payload: envelope.payload,
          payloadDigest: envelope.payloadDigest,
        }),
        signal: AbortSignal.timeout(2_000),
      });
    } catch {
      // A timeout/connection loss is UNKNOWN; this gateway never retries dispatch.
      send(response, 502, { error: "fake provider outcome unknown; reconciliation required" });
      return;
    }

    if (providerResponse.status === 409) {
      await providerResponse.arrayBuffer();
      send(response, 409, { error: "provider idempotency binding mismatch" });
      return;
    }
    if (!providerResponse.ok) {
      await providerResponse.arrayBuffer();
      send(response, 502, { error: "fake provider rejected the request" });
      return;
    }

    let providerResult;
    try {
      providerResult = await providerResponse.json();
    } catch {
      send(response, 502, { error: "malformed fake provider response" });
      return;
    }
    if (providerResult?.ok !== true || !receiptMatches(providerResult.receipt, envelope)) {
      send(response, 502, { error: "fake provider receipt binding mismatch" });
      return;
    }

    send(response, 200, {
      ok: true,
      replayed: providerResult.replayed === true,
      receipt: providerResult.receipt,
    });
  } catch (error) {
    send(response, Number.isInteger(error?.statusCode) ? error.statusCode : 400, {
      error: error?.statusCode === 413 ? "body too large" : "invalid request",
    });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  process.stdout.write("fake egress gateway listening on " + PORT + "\n");
});

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
