import assert from "node:assert/strict";
import test from "node:test";
import {
  isTrustedSameOriginRequest,
  shouldEnforceSameOriginForApiRequest,
} from "../lib/request-origin.mjs";

const endpoint = "https://zavqera.example/api/business/invitations";

test("accepts a request whose Origin matches the application origin", () => {
  const request = new Request(endpoint, {
    method: "POST",
    headers: { origin: "https://zavqera.example" },
  });
  assert.equal(isTrustedSameOriginRequest(request), true);
});

test("rejects an Origin from another origin even when Fetch Metadata says same-site", () => {
  const request = new Request(endpoint, {
    method: "POST",
    headers: { origin: "https://attacker.example", "sec-fetch-site": "same-site" },
  });
  assert.equal(isTrustedSameOriginRequest(request), false);
});

test("accepts the public Host origin when Next exposes an internal proxy URL", () => {
  const request = new Request("http://next-internal:3210/api/auth/password-policy", {
    method: "POST",
    headers: {
      origin: "http://127.0.0.1:3210",
      host: "127.0.0.1:3210",
    },
  });
  assert.equal(isTrustedSameOriginRequest(request), true);
});

test("uses the forwarded public protocol when comparing the Host origin", () => {
  const request = new Request("http://next-internal:3210/api/auth/password-policy", {
    method: "POST",
    headers: {
      origin: "https://zavqera.example",
      host: "zavqera.example",
      "x-forwarded-proto": "https",
    },
  });
  assert.equal(isTrustedSameOriginRequest(request), true);
});

test("rejects an internal request URL Origin when the public Host identifies another origin", () => {
  const request = new Request("http://next-internal:3210/api/missions/1", {
    method: "POST",
    headers: {
      origin: "http://next-internal:3210",
      host: "zavqera.example",
      "x-forwarded-proto": "https",
    },
  });
  assert.equal(isTrustedSameOriginRequest(request), false);
});

test("rejects malformed forwarded protocols instead of falling back to the internal URL", () => {
  const request = new Request("http://next-internal:3210/api/missions/1", {
    method: "POST",
    headers: {
      origin: "https://zavqera.example",
      host: "zavqera.example",
      "x-forwarded-proto": "javascript",
    },
  });
  assert.equal(isTrustedSameOriginRequest(request), false);
});

test("rejects opaque or malformed Origin values", () => {
  const request = new Request(endpoint, {
    method: "POST",
    headers: { origin: "null", "sec-fetch-site": "same-origin" },
  });
  assert.equal(isTrustedSameOriginRequest(request), false);
});

test("uses Fetch Metadata only when Origin is absent", () => {
  const sameOrigin = new Request(endpoint, {
    method: "POST",
    headers: { "sec-fetch-site": "same-origin" },
  });
  const crossSite = new Request(endpoint, {
    method: "POST",
    headers: { "sec-fetch-site": "cross-site" },
  });
  const missingSignals = new Request(endpoint, { method: "POST" });
  assert.equal(isTrustedSameOriginRequest(sameOrigin), true);
  assert.equal(isTrustedSameOriginRequest(crossSite), false);
  assert.equal(isTrustedSameOriginRequest(missingSignals), false);
});

test("applies the guard to every mutating API method", () => {
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    assert.equal(
      shouldEnforceSameOriginForApiRequest(new Request(endpoint, { method })),
      true,
      method,
    );
  }
});

test("does not apply the mutation guard to reads, non-API paths, or the separately authenticated internal worker", () => {
  assert.equal(shouldEnforceSameOriginForApiRequest(new Request(endpoint)), false);
  assert.equal(
    shouldEnforceSameOriginForApiRequest(new Request("https://zavqera.example/app", { method: "POST" })),
    false,
  );
  assert.equal(
    shouldEnforceSameOriginForApiRequest(new Request("https://zavqera.example/api/missions", { method: "GET" })),
    false,
  );
  assert.equal(
    shouldEnforceSameOriginForApiRequest(new Request("https://zavqera.example/api/internal/agent-executions", { method: "POST" })),
    false,
  );
});
