import { createHash } from "node:crypto";
import http from "node:http";

const PORT = 8080;
const MAX_BODY_BYTES = 16 * 1024;
const EXPECTED_AUDIENCE = "fake.external.v1";
// Fixed test-only upstream. Never derived from request data.
const FAKE_PROVIDER_URL = "http://fake-provider:9090/v1/actions";
const EXPECTED_KEYS = [
  "audience",
  "executionId",
  "expiresAt",
  "idempotencyKey",
  "payload",
  "payloadDigest",
];

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

const server = http.createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/health") {
    send(response, 200, { ok: true, mode: "fake-only" });
    return;
  }

  if (request.method !== "POST" || request.url !== "/v1/execute") {
    send(response, 404, { error: "not found" });
    return;
  }

  try {
    const envelope = await readJson(request);
    if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) {
      send(response, 400, { error: "invalid envelope" });
      return;
    }
    const keys = Object.keys(envelope).sort();
    const expectedKeys = [...EXPECTED_KEYS].sort();
    if (keys.length !== expectedKeys.length || keys.some((key, index) => key !== expectedKeys[index])) {
      send(response, 400, { error: "unexpected envelope fields" });
      return;
    }
    if (envelope.audience !== EXPECTED_AUDIENCE
      || typeof envelope.executionId !== "string"
      || !/^[0-9a-f-]{36}$/i.test(envelope.executionId)
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
      // In a real executor this is an UNKNOWN outcome requiring reconciliation.
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
  process.stdout.write(`fake egress gateway listening on ${PORT}\n`);
});

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
