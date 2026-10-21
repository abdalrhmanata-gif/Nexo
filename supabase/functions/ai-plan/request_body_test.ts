import { assertEquals, assertRejects } from "jsr:@std/assert";
import { MAX_REQUEST_BYTES, readBoundedBody } from "./request_body.ts";

Deno.test("reads a small JSON request body", async () => {
  const request = new Request("https://example.test/ai-plan", {
    method: "POST",
    body: JSON.stringify({ goal: "Plan a launch" }),
  });

  assertEquals(await readBoundedBody(request), '{"goal":"Plan a launch"}');
});

Deno.test("rejects a declared body larger than the limit", async () => {
  const request = new Request("https://example.test/ai-plan", {
    method: "POST",
    headers: { "content-length": String(MAX_REQUEST_BYTES + 1) },
    body: "{}",
  });

  await assertRejects(
    () => readBoundedBody(request),
    RangeError,
    "request_body_too_large",
  );
});

Deno.test("rejects a streamed body larger than the limit", async () => {
  const request = new Request("https://example.test/ai-plan", {
    method: "POST",
    body: "x".repeat(MAX_REQUEST_BYTES + 1),
  });

  await assertRejects(
    () => readBoundedBody(request),
    RangeError,
    "request_body_too_large",
  );
});

Deno.test("rejects invalid UTF-8 request bodies", async () => {
  const body = new Uint8Array([0xff, 0xfe]);
  const request = new Request("https://example.test/ai-plan", {
    method: "POST",
    body,
  });

  await assertRejects(() => readBoundedBody(request), TypeError);
});
