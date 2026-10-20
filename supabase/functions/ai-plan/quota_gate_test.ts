import { assertEquals } from "jsr:@std/assert";
import { AI_QUOTA_ENFORCEMENT_READY, quotaEnforcementError } from "./quota_gate.ts";

Deno.test("direct AI Edge Function stays disabled without authoritative quota enforcement", () => {
  assertEquals(AI_QUOTA_ENFORCEMENT_READY, false);
  assertEquals(quotaEnforcementError(), {
    error: "ai_quota_enforcement_not_configured",
  });
});
