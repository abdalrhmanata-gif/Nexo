import assert from "node:assert/strict";
import test from "node:test";
import { isTrustedSameOriginRequest } from "../lib/request-origin.mjs";

const endpoint = "https://zavqera.example/api/opportunities/analyze";

test("accepts a request whose Origin matches the application origin", () => {
  const request = new Request(endpoint, {
    method: "POST",
    headers: { origin: "https://zavqera.example" },
  });
  assert.equal(isTrustedSameOriginRequest(request), true);
});

test("rejects an Origin from another origin, even when the request URL is trusted", () => {
  const request = new Request(endpoint, {
    method: "POST",
    headers: { origin: "https://attacker.example", "sec-fetch-site": "same-site" },
  });
  assert.equal(isTrustedSameOriginRequest(request), false);
});

test("rejects an opaque or malformed Origin", () => {
  const request = new Request(endpoint, {
    method: "POST",
    headers: { origin: "null", "sec-fetch-site": "same-origin" },
  });
  assert.equal(isTrustedSameOriginRequest(request), false);
});

test("only falls back to Fetch Metadata when Origin is absent", () => {
  const sameOrigin = new Request(endpoint, {
    method: "POST",
    headers: { "sec-fetch-site": "same-origin" },
  });
  const missingSignals = new Request(endpoint, { method: "POST" });
  assert.equal(isTrustedSameOriginRequest(sameOrigin), true);
  assert.equal(isTrustedSameOriginRequest(missingSignals), false);
});

// Netlify runs the app behind a proxy. `request.url` can then carry the
// deploy's permalink host instead of the host the browser is on (see
// resolveRequestOrigin in lib/auth/redirect.mjs). Measured 2026-11-16 on a
// deploy preview: every POST from the page itself was refused with 403.
const permalink = "https://6afb00000000000000000000--zavqera.netlify.example/api/billing/checkout";
const publicOrigin = "https://zavqera.example";

test("accepts the page's own request when the proxy hands over a permalink URL", () => {
  for (const hostHeader of ["x-forwarded-host", "host"]) {
    const request = new Request(permalink, {
      method: "POST",
      headers: { origin: publicOrigin, "sec-fetch-site": "same-origin", [hostHeader]: "zavqera.example" },
    });
    assert.equal(isTrustedSameOriginRequest(request), true, hostHeader);
  }
});

test("the forwarded host is believed only together with the browser's own same-origin signal", () => {
  const forged = (headers) => isTrustedSameOriginRequest(new Request(permalink, { method: "POST", headers }));
  // Another site, saying so.
  assert.equal(forged({ origin: "https://attacker.example", "sec-fetch-site": "cross-site", "x-forwarded-host": "attacker.example" }), false);
  // Another site whose Origin matches a forwarded host it supplied, without Fetch Metadata.
  assert.equal(forged({ origin: "https://attacker.example", "x-forwarded-host": "attacker.example" }), false);
  // Another site, with the real public host forwarded.
  assert.equal(forged({ origin: "https://attacker.example", "sec-fetch-site": "same-origin", "x-forwarded-host": "zavqera.example" }), false);
  // A sibling subdomain is not the same origin.
  assert.equal(forged({ origin: "https://evil.zavqera.example", "sec-fetch-site": "same-site", host: "zavqera.example" }), false);
});
