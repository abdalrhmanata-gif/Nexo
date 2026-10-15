import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import dns from "node:dns/promises";
import net from "node:net";

const blockedCodes = new Set([
  "EACCES", "EPERM", "ENETUNREACH", "EHOSTUNREACH", "ECONNREFUSED",
  "ENOTFOUND", "EAI_AGAIN", "ETIMEDOUT", "ETIMEOUT",
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

async function assertDirectEgressBlocked() {
  await assert.rejects(
    fetch("https://example.com/", { signal: AbortSignal.timeout(2_000) }),
    (error) => {
      assert.ok(codesOf(error).some((code) => blockedCodes.has(code)), `fetch should be blocked: ${codesOf(error).join(",")}`);
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
        else reject(new Error(`unexpected DNS-resolved socket error: ${error.code ?? error.message}`));
      });
      socket.once("timeout", () => socket.destroy(Object.assign(new Error("timeout"), { code: "ETIMEDOUT" })));
    });
  } catch (error) {
    // Some isolated Docker configurations block external DNS itself. If it does
    // resolve, the resolved public IP must still be unreachable from the executor.
    if (!codesOf(error).some((code) => blockedCodes.has(code))) throw error;
  }

  await new Promise((resolve, reject) => {
    const socket = net.connect({ host: "203.0.113.1", port: 443, timeout: 2_000 });
    socket.once("connect", () => {
      socket.destroy();
      reject(new Error("direct TCP egress unexpectedly succeeded"));
    });
    socket.once("error", (error) => {
      if (blockedCodes.has(error.code)) resolve();
      else reject(new Error(`unexpected socket error: ${error.code ?? error.message}`));
    });
    socket.once("timeout", () => socket.destroy(Object.assign(new Error("timeout"), { code: "ETIMEDOUT" })));
  });
}

async function main() {
  await assertDirectEgressBlocked();

  const payload = { operation: "fake-send", message: "hello", count: 1 };
  const payloadDigest = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  const envelope = {
    executionId: "11111111-1111-4111-8111-111111111111",
    audience: "fake.external.v1",
    idempotencyKey: "isolated-smoke-idem-001",
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    payload,
    payloadDigest,
  };
  const gatewayUrl = "http://egress-gateway:8080/v1/execute";
  const firstResponse = await fetch(gatewayUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(envelope),
    signal: AbortSignal.timeout(2_000),
  });
  assert.equal(firstResponse.status, 200, "approved gateway path must work");
  const first = await firstResponse.json();
  assert.equal(first.ok, true);
  assert.equal(first.replayed, false);
  assert.equal(first.receipt.executionId, envelope.executionId);
  assert.equal(first.receipt.audience, envelope.audience);
  assert.equal(first.receipt.payloadDigest, payloadDigest);
  assert.equal(first.receipt.provider, "fake-provider-only");

  const duplicateResponse = await fetch(gatewayUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(envelope),
    signal: AbortSignal.timeout(2_000),
  });
  assert.equal(duplicateResponse.status, 200);
  const duplicate = await duplicateResponse.json();
  assert.equal(duplicate.replayed, true);
  assert.equal(duplicate.receipt.externalId, first.receipt.externalId, "duplicate key must return the same fake receipt");

  const untrustedDestinationResponse = await fetch(gatewayUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...envelope, destination: "https://attacker.example/steal" }),
    signal: AbortSignal.timeout(2_000),
  });
  assert.equal(untrustedDestinationResponse.status, 400, "request-supplied destinations must be rejected");

  process.stdout.write("PASS: direct egress blocked; approved fake gateway works; duplicate is idempotent; supplied destination rejected.\n");
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`);
  process.exitCode = 1;
});
