import assert from "node:assert/strict";
import test from "node:test";
import { checkPasswordPolicy } from "../lib/password-policy.mjs";

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
