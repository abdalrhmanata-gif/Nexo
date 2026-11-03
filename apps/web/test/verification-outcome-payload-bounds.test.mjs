import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  MAX_MISSION_JSON_BODY_BYTES,
  readBoundedJsonBody,
} from "../lib/read-bounded-json-body.mjs";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => readFileSync(join(webRoot, relative), "utf8");

function streamedRequest(chunks, headers = {}) {
  return new Request("http://localhost/test", {
    method: "POST",
    headers,
    body: new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(chunk);
        controller.close();
      },
    }),
    duplex: "half",
  });
}

test("bounded JSON reader accepts a valid streamed object within the byte ceiling", async () => {
  const request = streamedRequest([new TextEncoder().encode('{"criteria":{"summary":"checked"}}')]);
  const result = await readBoundedJsonBody(request);
  assert.deepEqual(result, { ok: true, value: { criteria: { summary: "checked" } } });
});

test("bounded JSON reader rejects a declared oversized body before reading it", async () => {
  const request = streamedRequest([], { "content-length": String(MAX_MISSION_JSON_BODY_BYTES + 1) });
  const result = await readBoundedJsonBody(request);
  assert.deepEqual(result, { ok: false, status: 413, error: "Request body is too large." });
});

test("bounded JSON reader rejects oversized chunked bodies without Content-Length", async () => {
  const bytes = new TextEncoder().encode("x".repeat(32));
  const request = streamedRequest(Array.from({ length: 6 }, () => bytes));
  const result = await readBoundedJsonBody(request, 160);
  assert.deepEqual(result, { ok: false, status: 413, error: "Request body is too large." });
});

test("bounded JSON reader rejects malformed JSON and malformed UTF-8", async () => {
  const malformedJson = await readBoundedJsonBody(streamedRequest([new TextEncoder().encode("{")]));
  assert.equal(malformedJson.ok, false);
  if (!malformedJson.ok) assert.equal(malformedJson.status, 400);

  const malformedUtf8 = await readBoundedJsonBody(streamedRequest([new Uint8Array([0xc3, 0x28])]));
  assert.deepEqual(malformedUtf8, {
    ok: false,
    status: 400,
    error: "Request body must be valid UTF-8 JSON.",
  });
});

test("verification and outcome routes share the bounded reader and disable caching", () => {
  for (const path of [
    "app/api/missions/[id]/verification/route.ts",
    "app/api/missions/[id]/outcome/route.ts",
  ]) {
    const source = read(path);
    assert.ok(source.includes("readBoundedJsonBody(request)"), path + " must use streamed body bounds");
    assert.ok(source.includes('"Cache-Control": "no-store"'), path + " must prevent caching evidence responses");
    assert.ok(!source.includes("request.json()"), path + " must not bypass the bounded reader");
  }
});
