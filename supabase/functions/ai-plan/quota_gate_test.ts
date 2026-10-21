import { assertEquals, assert } from "jsr:@std/assert";
import { AI_QUOTA_ENFORCEMENT_READY, quotaEnforcementError } from "./quota_gate.ts";

Deno.test("direct AI Edge Function stays disabled without authoritative quota enforcement", () => {
  assertEquals(AI_QUOTA_ENFORCEMENT_READY, false);
  assertEquals(quotaEnforcementError(), {
    error: "ai_quota_enforcement_not_configured",
  });
});

Deno.test("quota fail-closed response is ordered before any provider call", async () => {
  const source = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  const gate = source.indexOf("if (!AI_QUOTA_ENFORCEMENT_READY)");
  const failClosedResponse = source.indexOf("return json(quotaEnforcementError(), 503);", gate);
  const providerCall = source.indexOf("fetch(OPENAI_URL", gate);

  assert(gate >= 0, "request handler must contain the authoritative quota gate");
  assert(failClosedResponse > gate, "quota gate must return the explicit 503 error");
  assert(providerCall > failClosedResponse, "provider call must remain after the fail-closed return");
});
