import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import dns from "node:dns/promises";
import net from "node:net";

const GATEWAY_TOKEN = process.env.ZAVQERA_FAKE_GATEWAY_TOKEN ?? "";
const FAKE_PROVIDER_IP = process.env.ZAVQERA_FAKE_PROVIDER_IP ?? "";

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

  // Probe a fresh ESM child process against the actual listening fake-provider IP.
  // This complements the CommonJS child probe above; the OS network boundary must
  // remain effective regardless of the Node module loader selected by the child.
  const esmChildScript = [
    'import net from "node:net";',
    'const ip = process.env.ZAVQERA_TEST_PROVIDER_IP;',
    "const blocked = new Set(['EACCES','EPERM','ENETUNREACH','EHOSTUNREACH','ECONNREFUSED','ENOTFOUND','EAI_AGAIN','ESERVFAIL','ETIMEDOUT','ETIMEOUT']);",
    'const socket = net.connect({ host: ip, port: 9090, timeout: 1200 });',
    'socket.once("connect", () => { socket.destroy(); process.exit(42); });',
    'socket.once("error", (error) => process.exit(blocked.has(error.code) ? 0 : 43));',
    'socket.once("timeout", () => socket.destroy(Object.assign(new Error("timeout"), { code: "ETIMEDOUT" })));',
  ].join("\n");
  const esmChild = childProcess.spawnSync(process.execPath, ["--input-type=module", "-e", esmChildScript], {
    encoding: "utf8",
    timeout: 2_500,
    env: { PATH: process.env.PATH ?? "", ZAVQERA_TEST_PROVIDER_IP: FAKE_PROVIDER_IP },
  });
  assert.equal(esmChild.error, undefined, "fresh ESM child process probe must finish: " + (esmChild.error?.message ?? ""));
  assert.equal(esmChild.status, 0, "ESM child process must not reach the actual fake provider IP; stdout=" + esmChild.stdout + " stderr=" + esmChild.stderr);
}

async function assertDirectProviderIpBlocked() {
  assert.equal(net.isIP(FAKE_PROVIDER_IP), 4, "smoke harness must pass the ready fake provider's IPv4 address");
  await new Promise((resolve, reject) => {
    const socket = net.connect({ host: FAKE_PROVIDER_IP, port: 9090, timeout: 1_500 });
    socket.once("connect", () => {
      socket.destroy();
      reject(new Error("isolated executor connected directly to the fake provider IP instead of using the gateway"));
    });
    socket.once("error", (error) => {
      if (blockedCodes.has(error.code)) resolve();
      else reject(new Error("direct fake-provider IP probe produced an unclassified result: " + (error.code ?? error.message)));
    });
    socket.once("timeout", () => socket.destroy(Object.assign(new Error("timeout"), { code: "ETIMEDOUT" })));
  });
}

async function assertWorkerThreadDirectProviderIpBlocked() {
  assert.equal(net.isIP(FAKE_PROVIDER_IP), 4, "worker-thread probe requires the actual fake provider IPv4 address");
  const { Worker } = await import("node:worker_threads");
  const workerScript = [
    'const { parentPort, workerData } = require("node:worker_threads");',
    'const net = require("node:net");',
    "const blocked = new Set(['EACCES','EPERM','ENETUNREACH','EHOSTUNREACH','ECONNREFUSED','ENOTFOUND','EAI_AGAIN','ESERVFAIL','ETIMEDOUT','ETIMEOUT']);",
    'const socket = net.connect({ host: workerData.providerIp, port: 9090, timeout: 1200 });',
    'let reported = false;',
    'const finish = (ok, code) => { if (reported) return; reported = true; socket.destroy(); parentPort.postMessage({ ok, code }); };',
    'socket.once("connect", () => finish(false, "CONNECTED"));',
    'socket.once("error", (error) => finish(blocked.has(error.code), error.code ?? "UNKNOWN"));',
    'socket.once("timeout", () => socket.destroy(Object.assign(new Error("timeout"), { code: "ETIMEDOUT" })));',
  ].join("\n");
  await new Promise((resolve, reject) => {
    const worker = new Worker(workerScript, { eval: true, workerData: { providerIp: FAKE_PROVIDER_IP } });
    let settled = false;
    let timer;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) {
        void worker.terminate();
        reject(error);
      } else {
        resolve();
      }
    };
    timer = setTimeout(() => finish(new Error("worker-thread network probe timed out")), 3_000);
    worker.once("message", (result) => {
      if (result?.ok === true) finish();
      else finish(new Error("worker thread reached or could not classify direct fake-provider connection: " + (result?.code ?? "no code")));
    });
    worker.once("error", (error) => finish(error));
    worker.once("exit", (code) => {
      if (!settled) finish(new Error("worker thread exited before reporting its network result (code " + code + ")"));
    });
  });
}

async function assertDirectEgressBlocked() {
  await assertDirectProviderIpBlocked();
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
  await assertWorkerThreadDirectProviderIpBlocked();
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

function makeReconciliationEnvelope(envelope) {
  return {
    executionId: envelope.executionId,
    audience: envelope.audience,
    idempotencyKey: envelope.idempotencyKey,
    payloadDigest: envelope.payloadDigest,
  };
}

async function postEnvelope(
  envelope,
  timeoutMs = 2_000,
  extraFields = {},
  authorization = `Bearer ${GATEWAY_TOKEN}`,
) {
  const headers = { "content-type": "application/json" };
  if (typeof authorization === "string") headers.authorization = authorization;
  return fetch("http://egress-gateway:8080/v1/execute", {
    method: "POST",
    headers,
    body: JSON.stringify({ ...envelope, ...extraFields }),
    signal: AbortSignal.timeout(timeoutMs),
  });
}

async function postReconciliation(
  envelope,
  authorization = `Bearer ${GATEWAY_TOKEN}`,
) {
  const headers = { "content-type": "application/json" };
  if (typeof authorization === "string") headers.authorization = authorization;
  return fetch("http://egress-gateway:8080/v1/reconcile", {
    method: "POST",
    headers,
    body: JSON.stringify(makeReconciliationEnvelope(envelope)),
    signal: AbortSignal.timeout(2_000),
  });
}

async function assertFoundReceipt(response, envelope, label) {
  assert.equal(response.status, 200, label + " must return a verified result");
  const result = await response.json();
  assert.equal(result.ok, true);
  assert.equal(result.state, "FOUND");
  assert.equal(result.receipt.executionId, envelope.executionId);
  assert.equal(result.receipt.audience, envelope.audience);
  assert.equal(result.receipt.idempotencyKey, envelope.idempotencyKey);
  assert.equal(result.receipt.payloadDigest, envelope.payloadDigest);
  return result.receipt;
}

async function assertBadReceiptIsRejectedThenReconciled({ scenario, executionId, idempotencyKey }) {
  const envelope = makeEnvelope(executionId, idempotencyKey, {
    __contractTestScenario: scenario,
    message: "receipt contract exercise",
  });
  const failedResponse = await postEnvelope(envelope);
  assert.equal(failedResponse.status, 502, scenario + " must not be accepted as a successful dispatch");
  const failed = await failedResponse.json();
  assert.match(failed.error, /receipt binding mismatch/i);

  const reconciledResponse = await postReconciliation(envelope);
  const receipt = await assertFoundReceipt(reconciledResponse, envelope, scenario + " reconciliation");
  assert.equal(receipt.externalId, "fake-" + envelope.idempotencyKey);
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

  const reconciliationResponse = await postReconciliation(envelope);
  assert.equal(reconciliationResponse.status, 200);
  const reconciliation = await reconciliationResponse.json();
  assert.equal(reconciliation.ok, true);
  assert.equal(reconciliation.state, "NOT_FOUND");
  // The fake lookup result is not a generic proof of NOT_SENT for real providers.
}

async function main() {
  assert.match(GATEWAY_TOKEN, /^[a-f0-9]{64}$/, "smoke harness must receive a fresh 256-bit fake-gateway token");
  await assertDirectEgressBlocked();

  const payload = { operation: "fake-send", message: "hello", count: 1 };
  const envelope = makeEnvelope("11111111-1111-4111-8111-111111111111", "isolated-smoke-idem-001", payload);

  const badTokenValue = "0".repeat(64) === GATEWAY_TOKEN ? "1".repeat(64) : "0".repeat(64);
  const deniedDispatch = await postEnvelope(envelope, 2_000, {}, null);
  assert.equal(deniedDispatch.status, 401, "dispatch without executor authentication must be denied");
  const forgedDispatch = await postEnvelope(envelope, 2_000, {}, `Bearer ${badTokenValue}`);
  assert.equal(forgedDispatch.status, 401, "dispatch with an invalid executor token must be denied");
  const deniedReconciliation = await postReconciliation(envelope, null);
  assert.equal(deniedReconciliation.status, 401, "reconciliation without executor authentication must be denied");
  const forgedReconciliation = await postReconciliation(envelope, `Bearer ${badTokenValue}`);
  assert.equal(forgedReconciliation.status, 401, "reconciliation with an invalid executor token must be denied");

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
  const recoveredReceipt = await assertFoundReceipt(
    await postReconciliation(uncertainEnvelope),
    uncertainEnvelope,
    "UNKNOWN provider reconciliation",
  );
  assert.equal(recoveredReceipt.externalId, "fake-" + uncertainEnvelope.idempotencyKey);

  await assertBadReceiptIsRejectedThenReconciled({
    scenario: "missing-receipt",
    executionId: "33333333-3333-4333-8333-333333333333",
    idempotencyKey: "smoke-missing-receipt",
  });
  await assertBadReceiptIsRejectedThenReconciled({
    scenario: "malformed-receipt",
    executionId: "44444444-4444-4444-8444-444444444444",
    idempotencyKey: "smoke-malformed-receipt",
  });
  await assertBadReceiptIsRejectedThenReconciled({
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

  const inconsistentReconciliationEnvelope = makeEnvelope(
    "99999999-9999-4999-8999-999999999999",
    "smoke-reconcile-receipt-mismatch",
    { __contractTestScenario: "reconcile-receipt-mismatch", message: "lookup receipt binding" },
  );
  const dispatchWithStoredReceipt = await postEnvelope(inconsistentReconciliationEnvelope);
  assert.equal(dispatchWithStoredReceipt.status, 200);
  const mismatchedReconciliation = await postReconciliation(inconsistentReconciliationEnvelope);
  assert.equal(mismatchedReconciliation.status, 502, "reconciliation receipt with a different audience must be rejected");
  const correctedReconciliation = await postReconciliation(inconsistentReconciliationEnvelope);
  const correctedReceipt = await assertFoundReceipt(correctedReconciliation, inconsistentReconciliationEnvelope, "corrected reconciliation");
  assert.equal(correctedReceipt.externalId, "fake-" + inconsistentReconciliationEnvelope.idempotencyKey);

  // A client timeout after accepted work must not imply cancellation at the provider.
  // Reconciliation observes the stored result without sending a second dispatch.
  const cancelledEnvelope = makeEnvelope(
    "88888888-8888-4888-8888-888888888888",
    "smoke-client-cancel-after-accept",
    { __contractTestScenario: "delayed-success", message: "caller stopped waiting" },
  );
  await assert.rejects(postEnvelope(cancelledEnvelope, 150));
  await new Promise((resolve) => setTimeout(resolve, 800));
  const cancelledReceipt = await assertFoundReceipt(
    await postReconciliation(cancelledEnvelope),
    cancelledEnvelope,
    "reconciliation after caller timeout",
  );
  assert.equal(cancelledReceipt.externalId, "fake-" + cancelledEnvelope.idempotencyKey);

  // Race a delayed FOUND lookup against a quick NOT_FOUND lookup. Each HTTP response
  // must stay bound to its own caller; no global response state may cross the streams.
  const slowReconcileEnvelope = makeEnvelope(
    "abababab-abab-4bab-8bab-abababababab",
    "smoke-slow-reconcile",
    { __contractTestScenario: "slow-reconcile", message: "known receipt with deliberately delayed lookup" },
  );
  const slowDispatch = await postEnvelope(slowReconcileEnvelope);
  assert.equal(slowDispatch.status, 200);
  const unknownConcurrentEnvelope = makeEnvelope(
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    "smoke-concurrent-not-found",
    { message: "no dispatch attempted for this identity" },
  );
  const [slowLookupResponse, quickLookupResponse] = await Promise.all([
    postReconciliation(slowReconcileEnvelope),
    postReconciliation(unknownConcurrentEnvelope),
  ]);
  const slowLookupReceipt = await assertFoundReceipt(
    slowLookupResponse,
    slowReconcileEnvelope,
    "concurrent delayed FOUND lookup",
  );
  assert.equal(slowLookupReceipt.externalId, "fake-" + slowReconcileEnvelope.idempotencyKey);
  assert.equal(quickLookupResponse.status, 200);
  const quickLookup = await quickLookupResponse.json();
  assert.equal(quickLookup.ok, true);
  assert.equal(quickLookup.state, "NOT_FOUND", "concurrent no-record lookup must not receive the other execution's receipt");
  assert.equal(quickLookup.receipt, undefined);

  process.stdout.write("PASS: isolated executor egress denied across static, dynamic, CommonJS and child-process transports; UNKNOWN resolved by lookup; receipt and no-retry cases passed.\n");
}

main().catch((error) => {
  process.stderr.write((error.stack ?? error) + "\n");
  process.exitCode = 1;
});
