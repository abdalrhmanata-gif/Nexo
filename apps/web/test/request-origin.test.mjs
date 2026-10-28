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
