import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import dns from "node:dns/promises";
import net from "node:net";

const blockedCodes = new Set([
  "EACCES", "EPERM", "ENETUNREACH", "EHOSTUNREACH", "ECONNREFUSED",
  "ENOTFOUND", "EAI_AGAIN", "ESERVFAIL", "ETIMEDOUT", "ETIMEOUT",
]);

function codesOf(error) {
  const codes = [];
  const seen = new Set();
  let current = error;
  while (current && typeof current === "object" && !seen.has(current) && codes.length < 8) {
    seen.add(current);
    if (typeof current.code === "string") codes.push(current.code);
    current = current.cause;
  }
  return codes;
}

function assertSocketBlocked(netApi, label) {
  return new Promise((resolve, reject) => {
    const socket = netApi.connect({ host: "203.0.113.1", port: 443, timeout: 1_200 });
    socket.once("connect", () => {
      socket.destroy();
      reject(new Error(label + " unexpectedly established a TCP connection"));
    });
    socket.once("error", (error) => {
      if (blockedCodes.has(error.code)) resolve();
      else reject(new Error(label + " got an unclassified socket error: " + (error.code ?? error.message)));
    });
    socket.once("timeout", () => socket.destroy(Object.assign(new Error("timeout"), { code: "ETIMEDOUT" })));
  });
}

function assertHttpTransportBlocked(httpApi, url, label) {
  return new Promise((resolve, reject) => {
    const request = httpApi.get(url, (response) => {
      response.resume();
      reject(new Error(label + " unexpectedly received an HTTP response"));
    });
    request.setTimeout(1_200, () => request.destroy(Object.assign(new Error("timeout"), { code: "ETIMEDOUT" })));
    request.once("error", (error) => {
      if (blockedCodes.has(error.code)) resolve();
      else reject(new Error(label + " got an unclassified request error: " + (error.code ?? error.message)));
    });
  });
}

function assertTlsBlocked(tlsApi) {
  return new Promise((resolve, reject) => {
    const socket = tlsApi.connect({
      host: "203.0.113.1",
      port: 443,
      servername: "example.com",
      timeout: 1_200,
    });
    socket.once("secureConnect", () => {
      socket.destroy();
      reject(new Error("dynamically loaded TLS transport unexpectedly established a connection"));
    });
    socket.once("error", (error) => {
      if (blockedCodes.has(error.code)) resolve();
      else reject(new Error("dynamically loaded TLS got an unclassified error: " + (error.code ?? error.message)));
    });
    socket.once("timeout", () => socket.destroy(Object.assign(new Error("timeout"), { code: "ETIMEDOUT" })));
  });
}

async function assertDynamicLoaderAndProcessEgressBlocked() {
  // ESM dynamic imports and CommonJS createRequire must inherit the same OS network boundary.
  const dynamicNet = await import("node:net");
  await assertSocketBlocked(dynamicNet, "ESM dynamic import of node:net");

  const moduleApi = await import("node:module");
  const require = moduleApi.createRequire(import.meta.url);
  const requiredNet = require("node:net");
  await assertSocketBlocked(requiredNet, "createRequire loading node:net");

  const dynamicHttp = await import("node:http");
  await assertHttpTransportBlocked(dynamicHttp, "http://example.com/", "ESM dynamic import of node:http");

  const dynamicHttps = await import("node:https");
  await assertHttpTransportBlocked(dynamicHttps, "https://example.com/", "ESM dynamic import of node:https");

  const dynamicTls = await import("node:tls");
  await assertTlsBlocked(dynamicTls);

  // Spawn a fresh Node process using the CommonJS loader to catch process-level bypass attempts.
  const childProcess = await import("node:child_process");
  const childScript = [
    "const net = require('node:net');",
    "const blocked = new Set(['EACCES','EPERM','ENETUNREACH','EHOSTUNREACH','ECONNREFUSED','ENOTFOUND','EAI_AGAIN','ESERVFAIL','ETIMEDOUT','ETIMEOUT']);",
    "const socket = net.connect({ host: '203.0.113.1', port: 443, timeout: 1000 });",
    "socket.once('connect', () => { socket.destroy(); process.exit(42); });",
    "socket.once('error', (error) => process.exit(blocked.has(error.code) ? 0 : 43));",
    "socket.once('timeout', () => socket.destroy(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })));",
  ].join("\n");
  const child = childProcess.spawnSync(process.execPath, ["-e", childScript], {
    encoding: "utf8",
    timeout: 2_500,
  });
  assert.equal(child.error, undefined, "child-process probe must finish without spawn/timeout errors: " + (child.error?.message ?? ""));
  assert.equal(child.status, 0, "fresh child process must not bypass the executor network boundary; stdout=" + child.stdout + " stderr=" + child.stderr);
}

async function assertDirectEgressBlocked() {
  await assert.rejects(
    fetch("https://example.com/", { signal: AbortSignal.timeout(2_000) }),
    (error) => {
      assert.ok(codesOf(error).some((code) => blockedCodes.has(code)), "fetch should be blocked: " + codesOf(error).join(","));
      return true;
    },
  );

  await assert.rejects(
    fetch("http://fake-provider:9090/health", { signal: AbortSignal.timeout(2_000) }),
    (error) => {
      assert.ok(codesOf(error).some((code) => blockedCodes.has(code)), "executor must not reach provider network: " + codesOf(error).join(","));
      return true;
    },
  );

  try {
    const addresses = await dns.resolve4("example.com");
    assert.ok(addresses.length > 0, "DNS response must contain at least one address when resolution is available");
    const resolvedAddress = addresses[0];
    await new Promise((resolve, reject) => {
      const socket = net.connect({ host: resolvedAddress, port: 443, timeout: 2_000 });
      socket.once("connect", () => {
        socket.destroy();
        reject(new Error("outbound connection to DNS-resolved public address unexpectedly succeeded"));
      });
      socket.once("error", (error) => {
        if (blockedCodes.has(error.code)) resolve();
        else reject(new Error("unexpected DNS-resolved socket error: " + (error.code ?? error.message)));
      });
      socket.once("timeout", () => socket.destroy(Object.assign(new Error("timeout"), { code: "ETIMEDOUT" })));
    });
  } catch (error) {
    // Some isolated Docker configurations block external DNS itself. If it does
    // resolve, the resolved public IP must still be unreachable from the executor.
    if (!codesOf(error).some((code) => blockedCodes.has(code))) throw error;
  }

  await assertSocketBlocked(net, "statically imported node:net");
  await assertDynamicLoaderAndProcessEgressBlocked();
}

function makeEnvelope(executionId, idempotencyKey, payload) {
  return {
    executionId,
    audience: "fake.external.v1",
    idempotencyKey,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    payload,
    payloadDigest: createHash("sha256").update(JSON.stringify(payload)).digest("hex"),
  };
}

async function postEnvelope(envelope, timeoutMs = 2_000, extraFields = {}) {
  return fetch("http://egress-gateway:8080/v1/execute", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...envelope, ...extraFields }),
    signal: AbortSignal.timeout(timeoutMs),
  });
}

async function assertBadReceiptIsRejectedThenRecoverable({ scenario, executionId, idempotencyKey }) {
  const envelope = makeEnvelope(executionId, idempotencyKey, {
    __contractTestScenario: scenario,
    message: "receipt contract exercise",
  });
  const failedResponse = await postEnvelope(envelope);
  assert.equal(failedResponse.status, 502, scenario + " must not be accepted as a successful dispatch");
  const failed = await failedResponse.json();
  assert.match(failed.error, /receipt binding mismatch/i);

  const replayResponse = await postEnvelope(envelope);
  assert.equal(replayResponse.status, 200, scenario + " must leave the stored fake receipt available for exact replay");
  const replay = await replayResponse.json();
  assert.equal(replay.replayed, true);
  assert.equal(replay.receipt.executionId, envelope.executionId);
  assert.equal(replay.receipt.audience, envelope.audience);
  assert.equal(replay.receipt.idempotencyKey, envelope.idempotencyKey);
  assert.equal(replay.receipt.payloadDigest, envelope.payloadDigest);
}

async function assertFailureIsNotRetriedInternally({ scenario, executionId, idempotencyKey }) {
  const envelope = makeEnvelope(executionId, idempotencyKey, {
    __contractTestScenario: scenario,
    message: "failure must not trigger an implicit retry",
  });
  const response = await postEnvelope(envelope);
  assert.equal(response.status, 502, scenario + " must fail closed at the gateway");
  const result = await response.json();
  assert.match(result.error, /rejected the request/i);
}

async function main() {
  await assertDirectEgressBlocked();

  const payload = { operation: "fake-send", message: "hello", count: 1 };
  const envelope = makeEnvelope("11111111-1111-4111-8111-111111111111", "isolated-smoke-idem-001", payload);

  const firstResponse = await postEnvelope(envelope);
  assert.equal(firstResponse.status, 200, "approved gateway path must work");
  const first = await firstResponse.json();
  assert.equal(first.ok, true);
  assert.equal(first.replayed, false);
  assert.equal(first.receipt.executionId, envelope.executionId);
  assert.equal(first.receipt.audience, envelope.audience);
  assert.equal(first.receipt.payloadDigest, envelope.payloadDigest);
  assert.equal(first.receipt.provider, "fake-provider-only");

  const duplicateResponse = await postEnvelope(envelope);
  assert.equal(duplicateResponse.status, 200);
  const duplicate = await duplicateResponse.json();
  assert.equal(duplicate.replayed, true);
  assert.equal(duplicate.receipt.externalId, first.receipt.externalId, "duplicate key must return the same fake receipt");

  const changedPayload = { ...payload, message: "changed after first dispatch" };
  const changedEnvelope = {
    ...envelope,
    payload: changedPayload,
    payloadDigest: createHash("sha256").update(JSON.stringify(changedPayload)).digest("hex"),
  };
  const reboundResponse = await postEnvelope(changedEnvelope);
  assert.equal(reboundResponse.status, 409, "provider must reject reusing an idempotency key with a different payload binding");

  const untrustedDestinationResponse = await postEnvelope(envelope, 2_000, { destination: "https://attacker.example/steal" });
  assert.equal(untrustedDestinationResponse.status, 400, "request-supplied destinations must be rejected");

  const uncertainEnvelope = makeEnvelope(
    "22222222-2222-4222-8222-222222222222",
    "smoke-accepted-then-timeout",
    { __contractTestScenario: "accepted-then-timeout", message: "accepted before response loss" },
  );
  const uncertainResponse = await postEnvelope(uncertainEnvelope);
  assert.equal(uncertainResponse.status, 502, "accepted work with a lost response must stay unknown");
  const uncertain = await uncertainResponse.json();
  assert.match(uncertain.error, /unknown.*reconciliation required/i);
  const recoveredResponse = await postEnvelope(uncertainEnvelope);
  assert.equal(recoveredResponse.status, 200, "exact replay can recover the provider's existing fake receipt");
  const recovered = await recoveredResponse.json();
  assert.equal(recovered.replayed, true);
  assert.equal(recovered.receipt.externalId, "fake-" + uncertainEnvelope.idempotencyKey);

  await assertBadReceiptIsRejectedThenRecoverable({
    scenario: "missing-receipt",
    executionId: "33333333-3333-4333-8333-333333333333",
    idempotencyKey: "smoke-missing-receipt",
  });
  await assertBadReceiptIsRejectedThenRecoverable({
    scenario: "malformed-receipt",
    executionId: "44444444-4444-4444-8444-444444444444",
    idempotencyKey: "smoke-malformed-receipt",
  });
  await assertBadReceiptIsRejectedThenRecoverable({
    scenario: "receipt-binding-mismatch",
    executionId: "55555555-5555-4555-8555-555555555555",
    idempotencyKey: "smoke-receipt-binding-mismatch",
  });

  await assertFailureIsNotRetriedInternally({
    scenario: "provider-429",
    executionId: "66666666-6666-4666-8666-666666666666",
    idempotencyKey: "smoke-provider-429",
  });
  await assertFailureIsNotRetriedInternally({
    scenario: "provider-500",
    executionId: "77777777-7777-4777-8777-777777777777",
    idempotencyKey: "smoke-provider-500",
  });

  // A client timeout after accepted work must not imply cancellation at the provider.
  // The test observes only the caller timeout; an exact replay checks duplicate safety.
  const cancelledEnvelope = makeEnvelope(
    "88888888-8888-4888-8888-888888888888",
    "smoke-client-cancel-after-accept",
    { __contractTestScenario: "delayed-success", message: "caller stopped waiting" },
  );
  await assert.rejects(postEnvelope(cancelledEnvelope, 150));
  await new Promise((resolve) => setTimeout(resolve, 800));
  const cancelledReplayResponse = await postEnvelope(cancelledEnvelope);
  assert.equal(cancelledReplayResponse.status, 200, "replay after caller timeout must return the one stored receipt");
  const cancelledReplay = await cancelledReplayResponse.json();
  assert.equal(cancelledReplay.replayed, true);
  assert.equal(cancelledReplay.receipt.executionId, cancelledEnvelope.executionId);

  process.stdout.write("PASS: isolated executor egress denied across static, dynamic, CommonJS and child-process transport paths; gateway UNKNOWN and provider receipt/failure cases exercised.\n");
}

main().catch((error) => {
  process.stderr.write((error.stack ?? error) + "\n");
  process.exitCode = 1;
});
