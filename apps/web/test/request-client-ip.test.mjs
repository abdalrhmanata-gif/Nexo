import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { getRequestClientIp } from "../lib/request-client-ip.mjs";

function request(headers) {
  return new Request("https://zavqera.test/api/anonymous-plan", { headers });
}

test("prefers Netlify's platform-managed client IP over request-supplied proxy headers", () => {
  const req = request({
    "x-nf-client-connection-ip": "198.51.100.24",
    "x-forwarded-for": "203.0.113.99, 203.0.113.100",
    "x-real-ip": "203.0.113.101",
  });
  assert.equal(getRequestClientIp(req), "198.51.100.24");
});

test("uses the right-most valid X-Forwarded-For address, not the left-most value", () => {
  const req = request({
    "x-forwarded-for": "203.0.113.99, 198.51.100.24",
  });
  assert.equal(getRequestClientIp(req), "198.51.100.24");
});

test("ignores malformed forwarded values and validates IPv4/IPv6 literals", () => {
  assert.equal(
    getRequestClientIp(request({ "x-forwarded-for": "not-an-ip, 2001:db8::9, also-invalid" })),
    "2001:db8::9",
  );
  assert.equal(
    getRequestClientIp(request({ "x-nf-client-connection-ip": "unknown", "x-real-ip": "198.51.100.42" })),
    "198.51.100.42",
  );
});

test("uses an explicit unknown bucket if no IP header contains a valid address", () => {
  assert.equal(
    getRequestClientIp(request({
      "x-nf-client-connection-ip": "spoofed",
      "x-forwarded-for": "invalid, value",
      "x-real-ip": "also-invalid",
    })),
    "unknown",
  );
});

test("anonymous AI endpoint uses the hardened client-IP resolver", () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const route = readFileSync(path.join(root, "app/api/ai/plan/anonymous/route.ts"), "utf8");
  assert.ok(route.includes('from "../../../../../lib/request-client-ip.mjs"'));
  assert.ok(route.includes("hashWithSalt(getRequestClientIp(request), salt)"));
  assert.equal(route.includes('split(",")[0]'), false);
});
