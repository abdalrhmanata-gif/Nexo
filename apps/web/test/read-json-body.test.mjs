import assert from "node:assert/strict";
import test from "node:test";

import { readJsonBody } from "../lib/read-json-body.mjs";

function fakeRequest({ contentLength, chunks }) {
  const headers = new Headers();
  if (contentLength !== undefined) headers.set("content-length", String(contentLength));
  let index = 0;
  let cancelled = false;
  const request = {
    headers,
    body: {
      getReader() {
        return {
          async read() {
            if (index >= chunks.length) return { done: true, value: undefined };
            return { done: false, value: chunks[index++] };
          },
          async cancel() {
            cancelled = true;
          },
        };
      },
    },
  };
  return { request, wasCancelled: () => cancelled };
}

test("parses valid JSON within the byte limit", async () => {
  const bytes = new TextEncoder().encode(JSON.stringify({ goal: "Build a plan" }));
  const { request } = fakeRequest({ chunks: [bytes] });
  const result = await readJsonBody(request);
  assert.deepEqual(result, { ok: true, value: { goal: "Build a plan" } });
});

test("rejects malformed JSON and invalid UTF-8", async () => {
  const malformed = fakeRequest({ chunks: [new TextEncoder().encode("{no-json")] });
  assert.deepEqual(await readJsonBody(malformed.request), {
    ok: false,
    reason: "invalid_json",
  });

  const invalidUtf8 = fakeRequest({ chunks: [new Uint8Array([0xff, 0xfe])] });
  assert.deepEqual(await readJsonBody(invalidUtf8.request), {
    ok: false,
    reason: "invalid_json",
  });
});

test("rejects a declared oversized body before reading it", async () => {
  let readerRequested = false;
  const request = {
    headers: new Headers({ "content-length": String(16 * 1024 + 1) }),
    body: {
      getReader() {
        readerRequested = true;
        throw new Error("oversized declared body must not be read");
      },
    },
  };
  assert.deepEqual(await readJsonBody(request), {
    ok: false,
    reason: "too_large",
  });
  assert.equal(readerRequested, false);
});

test("rejects actual streamed bytes over the limit even without content-length", async () => {
  const chunk = new Uint8Array(9000);
  const fake = fakeRequest({ chunks: [chunk, chunk] });
  assert.deepEqual(await readJsonBody(fake.request), {
    ok: false,
    reason: "too_large",
  });
  assert.equal(fake.wasCancelled(), true);
});

test("counts UTF-8 bytes, not JavaScript characters", async () => {
  const bytes = new TextEncoder().encode('"éé"');
  assert.equal(bytes.byteLength, 6);
  const request = fakeRequest({ chunks: [bytes] });
  assert.deepEqual(await readJsonBody(request.request, 5), {
    ok: false,
    reason: "too_large",
  });
});

test("honors exact byte boundaries", async () => {
  const bytes = new TextEncoder().encode("{}");
  const request = fakeRequest({ chunks: [bytes] });
  assert.deepEqual(await readJsonBody(request.request, 2), {
    ok: true,
    value: {},
  });
});
