import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { once } from "node:events";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const appRoot = fileURLToPath(new URL("..", import.meta.url));
const nextCli = join(appRoot, "node_modules", "next", "dist", "bin", "next");
const executionId = "11111111-1111-4111-8111-111111111111";
const workerToken = "test-only-worker-token-never-use-outside-local-test-2026";
const unregisteredAudience = "provider.unreviewed.runtime-test.v1";

async function assertOutboundNetworkUnavailable() {
  const signal = AbortSignal.timeout(5_000);
  await assert.rejects(
    fetch("https://example.com/", { signal }),
    (error) => {
      const seen = new Set();
      const codes = [];
      let current = error;
      while (current && typeof current === "object" && !seen.has(current) && codes.length < 8) {
        seen.add(current);
        if (typeof current.code === "string") codes.push(current.code);
        current = current.cause;
      }
      const blockedCodes = new Set([
        "EACCES",
        "EPERM",
        "ENETUNREACH",
        "EHOSTUNREACH",
        "ECONNREFUSED",
        "ENOTFOUND",
        "EAI_AGAIN",
      ]);
      assert.ok(
        codes.some((code) => blockedCodes.has(code)),
        `Expected OS-level egress denial; observed error codes: ${codes.join(",") || "none"}`,
      );
      return true;
    },
    "outbound HTTPS must be unavailable in the isolated container",
  );
}

async function reserveLocalPort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const { port } = address;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

function isolatedTestEnvironment() {
  const secretPattern = /(SUPABASE|OPENAI|ANTHROPIC|GEMINI|DATABASE_URL|POSTGRES|PROVIDER|ZAVQERA_.*(TOKEN|KEY|SECRET|URL))/i;
  const environment = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !secretPattern.test(key)),
  );
  return {
    ...environment,
    NEXT_TELEMETRY_DISABLED: "1",
    ZAVQERA_EXECUTION_WORKER_TOKEN: workerToken,
    SUPABASE_URL: "",
    SUPABASE_SERVICE_ROLE_KEY: "",
    NEXT_PUBLIC_SUPABASE_URL: "",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
    OPENAI_API_KEY: "",
  };
}

async function waitUntilReady(child, origin, getChildError, getOutput) {
  const deadline = Date.now() + 90_000;
  let lastError;
  while (Date.now() < deadline) {
    if (getChildError()) throw new Error(`Next.js process failed: ${getChildError()}\n${getOutput()}`);
    if (child.exitCode !== null) throw new Error(`Next.js exited with code ${child.exitCode}\n${getOutput()}`);
    try {
      const response = await fetch(`${origin}/api/internal/agent-executions/${executionId}`);
      await response.body?.cancel();
      if (response.status < 500) return;
      lastError = new Error(`Readiness probe returned HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await delay(250);
  }
  throw new Error(`Timed out waiting for Next.js: ${lastError ?? "no response"}\n${getOutput()}`);
}

async function postJson(origin, {
  authorization = `Bearer ${workerToken}`,
  execution = executionId,
  body,
}) {
  return fetch(`${origin}/api/internal/agent-executions/${execution}`, {
    method: "POST",
    headers: {
      authorization,
      "content-type": "application/json",
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

test("actual Next.js POST route enforces the trusted worker HTTP gate without external credentials", {
  timeout: 120_000,
}, async () => {
  if (process.env.ZAVQERA_TEST_NETWORK_ISOLATED === "1") {
    await assertOutboundNetworkUnavailable();
  }
  const port = await reserveLocalPort();
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn(
    process.execPath,
    [nextCli, "dev", "--hostname", "127.0.0.1", "--port", String(port)],
    { cwd: appRoot, env: isolatedTestEnvironment(), stdio: ["ignore", "pipe", "pipe"] },
  );

  let childError = null;
  let output = "";
  const capture = (chunk) => { output = (output + chunk.toString()).slice(-16_000); };
  child.stdout.on("data", capture);
  child.stderr.on("data", capture);
  child.on("error", (error) => { childError = error; });

  try {
    await waitUntilReady(child, origin, () => childError, () => output);

    const unauthorized = await postJson(origin, {
      authorization: "Bearer incorrect-test-token",
      body: { operation: "dispatch", audience: unregisteredAudience },
    });
    assert.equal(unauthorized.status, 401);
    assert.equal(unauthorized.headers.get("cache-control"), "no-store");
    await unauthorized.arrayBuffer();

    const malformedJson = await postJson(origin, { body: "{" });
    assert.equal(malformedJson.status, 400);
    await malformedJson.arrayBuffer();

    const injectedDependency = await postJson(origin, {
      body: {
        operation: "dispatch",
        audience: unregisteredAudience,
        suppliedAdapter: "must-not-be-used",
      },
    });
    assert.equal(injectedDependency.status, 400);
    await injectedDependency.arrayBuffer();

    const invalidExecution = await postJson(origin, {
      execution: "not-a-uuid",
      body: { operation: "dispatch", audience: unregisteredAudience },
    });
    assert.equal(invalidExecution.status, 400);
    await invalidExecution.arrayBuffer();

    const unknownAudience = await postJson(origin, {
      body: { operation: "dispatch", audience: unregisteredAudience },
    });
    assert.equal(unknownAudience.status, 503);
    assert.match((await unknownAudience.json()).error, /No reviewed provider adapter is registered/);

    const oversized = await postJson(origin, {
      body: {
        operation: "dispatch",
        audience: unregisteredAudience,
        padding: "x".repeat(165_000),
      },
    });
    assert.equal(oversized.status, 413);
    await oversized.arrayBuffer();


    // These valid research operation shapes must fail closed when trusted DB
    // credentials are deliberately absent, including under --network none.
    const researchPreflight = await postJson(origin, {
      body: {
        operation: "preflight_read_only_research",
        requestedBy: executionId,
      },
    });
    assert.equal(researchPreflight.status, 503);
    assert.equal(researchPreflight.headers.get("cache-control"), "no-store");
    assert.equal((await researchPreflight.json()).ready, false);

    const researchClaim = await postJson(origin, {
      body: {
        operation: "claim_read_only_research",
        requestedBy: executionId,
        requestId: "network-isolated-claim-request-0001",
      },
    });
    assert.equal(researchClaim.status, 503);
    assert.equal(researchClaim.headers.get("cache-control"), "no-store");
    assert.match((await researchClaim.json()).error, /claim could not be confirmed/);

    const researchCompletion = await postJson(origin, {
      body: {
        operation: "complete_read_only_research",
        requestedBy: executionId,
        status: "UNKNOWN",
        result: { reason: "NETWORK_ISOLATED_TEST" },
        evidence: {
          outcome: "UNKNOWN",
          verified: false,
          request_id: "network-isolated-test",
        },
        errorCode: null,
        errorMessage: null,
      },
    });
    assert.equal(researchCompletion.status, 503);
    assert.equal(researchCompletion.headers.get("cache-control"), "no-store");
    assert.match((await researchCompletion.json()).error, /completion could not be confirmed/);
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM");
      await Promise.race([
        once(child, "exit"),
        delay(5_000).then(() => {
          if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
        }),
      ]);
    }
  }
});
