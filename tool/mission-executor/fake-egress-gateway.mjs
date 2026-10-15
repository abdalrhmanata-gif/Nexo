import { createHash } from "node:crypto";
import http from "node:http";

const PORT = 8080;
const MAX_BODY_BYTES = 16 * 1024;
const EXPECTED_AUDIENCE = "fake.external.v1";
const EXPECTED_KEYS = [
  "audience",
  "executionId",
  "expiresAt",
  "idempotencyKey",
  "payload",
  "payloadDigest",
];
const receiptsByIdempotencyKey = new Map();

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
    if (keys.length !== EXPECTED_KEYS.length || keys.some((key, index) => key !== [...EXPECTED_KEYS].sort()[index])) {
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

    const prior = receiptsByIdempotencyKey.get(envelope.idempotencyKey);
    if (prior) {
      if (prior.executionId !== envelope.executionId
        || prior.audience !== envelope.audience
        || prior.payloadDigest !== envelope.payloadDigest) {
        send(response, 409, { error: "idempotency binding mismatch" });
        return;
      }
      send(response, 200, { ok: true, replayed: true, receipt: prior });
      return;
    }

    const receipt = Object.freeze({
      provider: "fake-provider-only",
      providerAccount: "fake-account-v1",
      externalId: `fake-${envelope.idempotencyKey}`,
      executionId: envelope.executionId,
      audience: envelope.audience,
      idempotencyKey: envelope.idempotencyKey,
      payloadDigest: envelope.payloadDigest,
    });
    receiptsByIdempotencyKey.set(envelope.idempotencyKey, receipt);
    send(response, 200, { ok: true, replayed: false, receipt });
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
