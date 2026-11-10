import assert from "node:assert/strict";
import test from "node:test";
import nextConfig from "../next.config.mjs";

// Read from the config the build actually uses, not from its source text, so
// a header that is declared but never returned fails here.

async function headersForEveryPath() {
  assert.equal(typeof nextConfig.headers, "function", "next.config.mjs must define headers()");
  const rules = await nextConfig.headers();
  const everywhere = rules.find((rule) => rule.source === "/:path*");
  assert.ok(everywhere, "the security headers must apply to every path, not a subset");
  return new Map(everywhere.headers.map((h) => [h.key.toLowerCase(), h.value]));
}

test("no other site can put this application inside a frame", async () => {
  const headers = await headersForEveryPath();
  assert.equal(headers.get("x-frame-options"), "DENY");
  assert.match(headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/);
});

test("the policy does not restrict scripts it has not been tested against", async () => {
  // A script-src written blind breaks Next.js's own inline scripts. If one is
  // added, it has to arrive with a browser test, and this assertion goes.
  const headers = await headersForEveryPath();
  assert.doesNotMatch(headers.get("content-security-policy") ?? "", /script-src|default-src/);
});

test("referrers, sniffing and device permissions are closed down", async () => {
  const headers = await headersForEveryPath();
  assert.equal(headers.get("referrer-policy"), "strict-origin-when-cross-origin");
  assert.equal(headers.get("x-content-type-options"), "nosniff");
  const permissions = headers.get("permissions-policy") ?? "";
  for (const feature of ["camera", "microphone", "geolocation", "payment"]) {
    assert.match(permissions, new RegExp(`${feature}=\\(\\)`), `${feature} must be denied`);
  }
});
