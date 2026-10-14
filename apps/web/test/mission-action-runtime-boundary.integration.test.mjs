import assert from "node:assert/strict";
import test from "node:test";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";
import dgram from "node:dgram";
import { Readable } from "node:stream";

import {
  createMissionActionWorkerOperationHandler,
  parseTrustedWorkerRequest,
} from "../lib/mission-authority/trusted-worker-http.mjs";
import {
  dispatchThroughJitClaim,
  reconcileThroughTrustedClaim,
  PERSISTENT_DISPATCH_DECISIONS,
} from "../lib/mission-authority/persistent-dispatch-gateway.mjs";

const EXECUTION_ID = "d3d61c35-1f9d-4c97-9310-e125f9e7f1c1";
const AUDIENCE = "provider.send.v1";
const WORKER_TOKEN = "runtime-http-test-token-abcdefghijklmnopqrstuvwxyz-123456";
const DISPATCH_CLAIMED_AT = new Date(Date.now() - 30_000).toISOString();
const LEASE_EXPIRES_AT = new Date(Date.now() + 5 * 60_000).toISOString();
const ROUTE_PATH = `/api/internal/agent-executions/${EXECUTION_ID}`;

function validClaim(overrides = {}) {
  return {
    id: EXECUTION_ID,
    status: "RUNNING",
    workspace_id: "workspace-test",
    mission_id: "mission-test",
    action_id: "action-test",
    agent_id: "agent-test",
    approval_id: "approval-test",
    idempotency_key: "runtime-boundary-test-key-001",
    lease_expires_at: LEASE_EXPIRES_AT,
    authority_snapshot: {
      external_side_effects: true,
      requires_approval: true,
    },
    request: {
      destination: "https://provider.example.test/send",
      audience: AUDIENCE,
      summary: "Test-only approved request",
      payload: { message: "never sent outside this test" },
    },
    dispatch_claimed_at: DISPATCH_CLAIMED_AT,
    dispatch_claim_authority_hash: "a".repeat(64),
    dispatch_claim_request_hash: "b".repeat(64),
    dispatch_claim_budget_revision: 7,
    ...overrides,
  };
}

function createFakeClient({ firstDispatchClaimError = null } = {}) {
  const calls = [];
  let dispatchClaimCount = 0;

  return {
    calls,
    async rpc(name, args) {
      calls.push({ name, args });

      if (name === "claim_agent_execution_dispatch") {
        dispatchClaimCount += 1;
        if (dispatchClaimCount === 1 && firstDispatchClaimError) {
          return { data: null, error: firstDispatchClaimError };
        }
        if (dispatchClaimCount > 1) {
          return {
            data: null,
            error: { code: "42501", message: "EXECUTION_DISPATCH_ALREADY_CLAIMED" },
          };
        }
        return { data: validClaim(), error: null };
      }

      if (name === "complete_agent_execution") {
        return {
          data: { id: args.p_execution_id ?? EXECUTION_ID, status: args.p_status },
          error: null,
        };
      }

      if (name === "claim_agent_execution_reconciliation") {
        return {
          data: validClaim({
            status: "UNKNOWN",
            reconciliation_claim_token: "test-only-reconciliation-claim-token",
            reconciliation_claimed_at: new Date(Date.now() - 10_000).toISOString(),
            reconciliation_lease_expires_at: LEASE_EXPIRES_AT,
            evidence: { outcome: "UNKNOWN", reconciliation_required: true },
          }),
          error: null,
        };
      }

      if (name === "reconcile_agent_execution_outcome") {
        return {
          data: { id: args.p_execution_id ?? EXECUTION_ID, status: args.p_status },
          error: null,
        };
      }

      throw new Error("UNEXPECTED_RPC_" + name);
    },
  };
}

function createTestAdapter({ events, transportResult, lookupResult }) {
  let dispatchCalls = 0;
  let reconciliationCalls = 0;
  let fakeTransportCalls = 0;

  return {
    adapter: {
      audience: AUDIENCE,
      async dispatch(claim) {
        dispatchCalls += 1;
        events.push("adapter:dispatch");
        assert.equal(claim.executionId, EXECUTION_ID);
        assert.equal(claim.audience, AUDIENCE);
        assert.equal(claim.destination, "https://provider.example.test/send");
        assert.ok(claim.authorityHash);
        assert.ok(claim.requestHash);

        // Deliberately local logic: it does not access fetch, sockets or an SDK.
        events.push("fake-transport");
        fakeTransportCalls += 1;
        return transportResult;
      },
      async reconcile(claim) {
        reconciliationCalls += 1;
        events.push("adapter:reconcile");
        assert.equal(claim.executionId, EXECUTION_ID);
        assert.ok(claim.reconciliationClaimToken);
        return lookupResult;
      },
    },
    counts: () => ({ dispatchCalls, reconciliationCalls, fakeTransportCalls }),
  };
}

function getTarget(args, protocol) {
  const first = args[0];
  try {
    if (first instanceof URL) {
      return { protocol: first.protocol, hostname: first.hostname, port: Number(first.port || (first.protocol === "https:" ? 443 : 80)) };
    }
    if (typeof first === "string" && /^[a-z][a-z0-9+.-]*:\/\//i.test(first)) {
      const url = new URL(first);
      return { protocol: url.protocol, hostname: url.hostname, port: Number(url.port || (url.protocol === "https:" ? 443 : 80)) };
    }
    if (typeof first === "number") {
      return { protocol, hostname: typeof args[1] === "string" ? args[1] : args[1]?.host, port: first };
    }
    if (first && typeof first === "object") {
      return {
        protocol: first.protocol || protocol,
        hostname: first.hostname || first.host || first.servername || "",
        port: Number(first.port || 0),
      };
    }
  } catch {
    // Treat an unparseable target as unapproved below.
  }
  return { protocol, hostname: "", port: 0 };
}

function isAllowedLoopbackTarget(target, allowedPort) {
  const hostname = String(target.hostname || "").replace(/^\[|\]$/g, "").toLowerCase();
  return (target.protocol === "http:" || target.protocol === "tcp:")
    && target.port === allowedPort
    && ["127.0.0.1", "localhost", "::1"].includes(hostname);
}

/**
 * Deny external traffic before it leaves this test process. Only HTTP requests
 * to this test's exact loopback port are permitted; HTTPS, raw TLS, and UDP are
 * disabled for the duration of the test.
 */
function installEgressGuard(allowedPort) {
  const blockedAttempts = [];
  const localHttpCalls = [];
  const originals = [];

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async function guardedFetch(input, init) {
    let url;
    try {
      url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    } catch {
      blockedAttempts.push({ transport: "fetch", target: "unparseable" });
      throw new Error("TEST_EGRESS_BLOCKED");
    }
    const target = { protocol: url.protocol, hostname: url.hostname, port: Number(url.port || (url.protocol === "https:" ? 443 : 80)) };
    if (!isAllowedLoopbackTarget(target, allowedPort)) {
      blockedAttempts.push({ transport: "fetch", target: url.origin });
      throw new Error("TEST_EGRESS_BLOCKED");
    }
    localHttpCalls.push({ transport: "fetch", target: url.origin });
    return originalFetch.call(this, input, init);
  };

  function guardMethod(module, methodName, protocol, { alwaysBlock = false } = {}) {
    const original = module[methodName];
    originals.push(() => { module[methodName] = original; });
    module[methodName] = function guardedTransport(...args) {
      const target = getTarget(args, protocol);
      if (alwaysBlock || !isAllowedLoopbackTarget(target, allowedPort)) {
        blockedAttempts.push({
          transport: `${protocol}${methodName}`,
          target: `${target.protocol}//${target.hostname}:${target.port}`,
        });
        throw new Error("TEST_EGRESS_BLOCKED");
      }
      localHttpCalls.push({
        transport: `${protocol}${methodName}`,
        target: `${target.protocol}//${target.hostname}:${target.port}`,
      });
      return original.apply(this, args);
    };
  }

  guardMethod(http, "request", "http:");
  guardMethod(http, "get", "http:");
  guardMethod(https, "request", "https:", { alwaysBlock: true });
  guardMethod(https, "get", "https:", { alwaysBlock: true });
  guardMethod(net, "connect", "tcp:");
  guardMethod(net, "createConnection", "tcp:");
  guardMethod(tls, "connect", "tls:", { alwaysBlock: true });
  guardMethod(dgram, "createSocket", "udp:", { alwaysBlock: true });

  return {
    blockedAttempts,
    localHttpCalls,
    restore() {
      globalThis.fetch = originalFetch;
      for (const restore of originals.reverse()) restore();
    },
  };
}

async function startHttpHarness({ operationHandler }) {
  let port = 0;
  const server = http.createServer(async (incoming, outgoing) => {
    try {
      const headers = new Headers();
      for (const [name, value] of Object.entries(incoming.headers)) {
        if (Array.isArray(value)) for (const item of value) headers.append(name, item);
        else if (value !== undefined) headers.set(name, value);
      }
      const request = new Request(`http://127.0.0.1:${port}${incoming.url || "/"}`, {
        method: incoming.method,
        headers,
        body: incoming.method === "GET" || incoming.method === "HEAD" ? undefined : Readable.toWeb(incoming),
        duplex: "half",
      });

      const parsed = await parseTrustedWorkerRequest(request, WORKER_TOKEN);
      if (!parsed.ok) {
        incoming.resume();
        outgoing.writeHead(parsed.status, {
          "content-type": "application/json",
          "cache-control": "no-store",
        });
        outgoing.end(JSON.stringify(parsed.body));
        return;
      }

      const match = /^\/api\/internal\/agent-executions\/([^/]+)$/i.exec(incoming.url || "");
      if (incoming.method !== "POST" || !match) {
        outgoing.writeHead(404, { "content-type": "application/json", "cache-control": "no-store" });
        outgoing.end(JSON.stringify({ error: "Not found." }));
        return;
      }

      const result = await operationHandler({
        workerBody: parsed.body,
        executionId: match[1],
      });
      outgoing.writeHead(result.status, {
        "content-type": "application/json",
        "cache-control": "no-store",
      });
      outgoing.end(JSON.stringify(result.body));
    } catch (error) {
      if (!outgoing.headersSent) outgoing.writeHead(500, { "content-type": "application/json", "cache-control": "no-store" });
      outgoing.end(JSON.stringify({ error: error instanceof Error ? error.message : "Harness error." }));
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  port = server.address().port;

  return {
    url: `http://127.0.0.1:${port}${ROUTE_PATH}`,
    port,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

test("trusted worker HTTP path enforces auth, JIT ordering, denial, UNKNOWN recovery and outbound egress fence", async () => {
  const events = [];
  let activeClient = createFakeClient();
  let activeAdapter = createTestAdapter({
    events,
    transportResult: { state: "SUCCEEDED", receipt: { id: "test-http-receipt-001", status: "accepted" } },
  });

  let clientCreations = 0;
  const operationHandler = createMissionActionWorkerOperationHandler({
    resolveAdapter(audience) {
      events.push("worker:resolve-adapter");
      return audience === AUDIENCE ? activeAdapter.adapter : null;
    },
    createClient() {
      clientCreations += 1;
      events.push("worker:create-client");
      return activeClient;
    },
    dispatch: (input) => dispatchThroughJitClaim(input),
    reconcile: (input) => reconcileThroughTrustedClaim(input),
  });

  const harness = await startHttpHarness({ operationHandler });
  const guard = installEgressGuard(harness.port);
  try {
    // Prove the guard blocks a would-be external request before network I/O.
    await assert.rejects(globalThis.fetch("https://external-egress-probe.invalid/test"), /TEST_EGRESS_BLOCKED/);
    assert.equal(guard.blockedAttempts.length, 1);
    assert.equal(guard.blockedAttempts[0].transport, "fetch");
    guard.blockedAttempts.length = 0;

    const unauthorised = await globalThis.fetch(harness.url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer incorrect-token" },
      body: JSON.stringify({ operation: "dispatch", audience: AUDIENCE }),
    });
    assert.equal(unauthorised.status, 401);
    assert.equal(clientCreations, 0, "unauthorised HTTP requests must not create a privileged client");

    const malformed = await globalThis.fetch(harness.url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${WORKER_TOKEN}` },
      body: JSON.stringify({ operation: "dispatch", audience: AUDIENCE, suppliedAdapter: "attacker-controlled" }),
    });
    assert.equal(malformed.status, 400);
    assert.equal(clientCreations, 0, "extra request fields must not reach trusted dependency selection");

    const invalidExecution = await globalThis.fetch(`http://127.0.0.1:${harness.port}/api/internal/agent-executions/not-a-uuid`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${WORKER_TOKEN}` },
      body: JSON.stringify({ operation: "dispatch", audience: AUDIENCE }),
    });
    assert.equal(invalidExecution.status, 400);
    assert.equal(clientCreations, 0, "invalid execution ids must be rejected before client creation");

    const oversized = await globalThis.fetch(harness.url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${WORKER_TOKEN}` },
      body: JSON.stringify({ operation: "dispatch", audience: AUDIENCE, padding: "x".repeat(165_000) }),
    });
    assert.equal(oversized.status, 413);
    assert.equal(clientCreations, 0, "oversized requests must be rejected before adapter/client selection");

    const wrongAudience = await globalThis.fetch(harness.url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${WORKER_TOKEN}` },
      body: JSON.stringify({ operation: "dispatch", audience: "provider.unreviewed.v1" }),
    });
    assert.equal(wrongAudience.status, 503);
    assert.equal(clientCreations, 0, "unregistered audiences must fail before privileged client creation");
    events.length = 0;

    const success = await globalThis.fetch(harness.url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${WORKER_TOKEN}` },
      body: JSON.stringify({ operation: "dispatch", audience: AUDIENCE }),
    });
    assert.equal(success.status, 200);
    const successBody = await success.json();
    assert.equal(successBody.decision, PERSISTENT_DISPATCH_DECISIONS.DISPATCHED);
    assert.equal(activeAdapter.counts().fakeTransportCalls, 1);
    assert.deepEqual(events, [
      "worker:resolve-adapter",
      "worker:create-client",
      "adapter:dispatch",
      "fake-transport",
    ], "the approved HTTP request must resolve one adapter and make one fake dispatch only");
    assert.equal(success.headers.get("cache-control"), "no-store");

    events.length = 0;
    activeClient = createFakeClient({
      firstDispatchClaimError: { code: "42501", message: "APPROVAL_REQUIRED_OR_SCOPE_CHANGED" },
    });
    activeAdapter = createTestAdapter({
      events,
      transportResult: { state: "SUCCEEDED", receipt: { id: "must-not-be-sent" } },
    });
    const denied = await globalThis.fetch(harness.url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${WORKER_TOKEN}` },
      body: JSON.stringify({ operation: "dispatch", audience: AUDIENCE }),
    });
    assert.equal(denied.status, 409);
    assert.equal((await denied.json()).decision, PERSISTENT_DISPATCH_DECISIONS.DENY);
    assert.equal(denied.headers.get("cache-control"), "no-store");
    assert.equal(activeAdapter.counts().fakeTransportCalls, 0, "JIT denial must block the fake transport");

    events.length = 0;
    activeClient = createFakeClient();
    activeAdapter = createTestAdapter({
      events,
      transportResult: { state: "UNKNOWN" },
      lookupResult: {
        state: "NOT_SENT",
        authoritative: true,
        method: "idempotency_key_lookup",
        providerState: "not_found",
        checkedAt: new Date().toISOString(),
      },
    });
    const unknown = await globalThis.fetch(harness.url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${WORKER_TOKEN}` },
      body: JSON.stringify({ operation: "dispatch", audience: AUDIENCE }),
    });
    assert.equal(unknown.status, 202);
    assert.equal((await unknown.json()).status, "UNKNOWN");

    const attemptedRetry = await globalThis.fetch(harness.url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${WORKER_TOKEN}` },
      body: JSON.stringify({ operation: "dispatch", audience: AUDIENCE }),
    });
    assert.equal(attemptedRetry.status, 202);
    assert.equal(activeAdapter.counts().dispatchCalls, 1, "UNKNOWN must not trigger a second dispatch");

    const reconciled = await globalThis.fetch(harness.url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${WORKER_TOKEN}` },
      body: JSON.stringify({ operation: "reconcile", audience: AUDIENCE }),
    });
    assert.equal(reconciled.status, 200);
    assert.equal((await reconciled.json()).status, "FAILED");
    assert.equal(activeAdapter.counts().dispatchCalls, 1);
    assert.equal(activeAdapter.counts().fakeTransportCalls, 1);
    assert.equal(activeAdapter.counts().reconciliationCalls, 1);

    assert.deepEqual(
      activeClient.calls.map((call) => call.name),
      [
        "claim_agent_execution_dispatch",
        "complete_agent_execution",
        "claim_agent_execution_dispatch",
        "claim_agent_execution_reconciliation",
        "reconcile_agent_execution_outcome",
      ],
    );
    assert.equal(guard.blockedAttempts.length, 0, "no unapproved external network attempt may be made");
    assert.ok(guard.localHttpCalls.length >= 6, "the HTTP harness itself exercised the local loopback listener");
  } finally {
    guard.restore();
    await harness.close();
  }
});
