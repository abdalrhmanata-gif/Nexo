import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkPasswordPolicy } from "../lib/password-policy.mjs";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const hashForPassword = "password";

test("password policy sends only a five-character SHA-1 range prefix and rejects a matched suffix", async () => {
  const response = {
    ok: true,
    text: async () => "AABBCCDD00112233445566778899AABBCCD:1\n",
  };
  const calls = [];
  const result = await checkPasswordPolicy(hashForPassword, async (url, options) => {
    calls.push({ url, options });
    return response;
  });

  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /^https:\/\/api\.pwnedpasswords\.com\/range\/[0-9A-F]{5}$/);
  assert.equal(calls[0].options.headers["Add-Padding"], "true");
  assert.equal(calls[0].options.headers["User-Agent"], "ZAVQERA/1.0 password-policy");
  assert.equal(calls[0].url.includes("5BAA6"), true);
  assert.deepEqual(result, { allowed: true });
});

test("password policy rejects a suffix that matches the full SHA-1 password hash", async () => {
  const suffix = "01A5AB1774D418369EAB31C03FD78583A2B";
  const result = await checkPasswordPolicy("example-safe-password", async () => ({
    ok: true,
    text: async () => `${suffix}:1\n`,
  }));
  assert.equal(result.allowed, false);
  assert.equal(result.reason, "COMPROMISED_PASSWORD");
});

test("password policy fails closed when the external check is unavailable", async () => {
  await assert.rejects(
    checkPasswordPolicy("example-safe-password", async () => ({ ok: false, text: async () => "" })),
    /PASSWORD_POLICY_UNAVAILABLE/,
  );
});


test("password-policy API keeps production fail-closed behavior independent of E2E stubs", async () => {
  const routePath = join(webRoot, "app", "api", "auth", "password-policy", "route.ts");
  const browserTestPath = join(webRoot, "test", "e2e", "launch-gate.spec.mjs");
  const route = await readFile(routePath, "utf8");
  const browserTest = await readFile(browserTestPath, "utf8");

  const policyCall = route.indexOf("await checkPasswordPolicy(password)");
  const failureHandler = route.indexOf("} catch {", policyCall);
  assert.ok(policyCall >= 0, "the API must call the real password-policy utility");
  assert.ok(failureHandler > policyCall, "the upstream failure handler must follow the real policy call");
  assert.match(route.slice(failureHandler, failureHandler + 500), /status:\s*503/,
    "an unavailable policy source must fail closed with HTTP 503");
  assert.doesNotMatch(route, /ZAVQERA_E2E|process\.env|PLAYWRIGHT/i,
    "production password-policy behavior must not depend on E2E-only bypass flags");

  assert.match(browserTest, /url\.pathname === ["']\/api\/auth\/password-policy["']/,
    "the deterministic override belongs to the browser test boundary");
  assert.match(browserTest, /route\.fulfill\(\{\s*status:\s*204/,
    "Playwright may stub the policy POST only in the disposable browser flow");
});
