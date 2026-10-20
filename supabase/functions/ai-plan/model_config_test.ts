import { assertEquals } from "jsr:@std/assert";
import { resolveConfiguredModel } from "./model_config.ts";

Deno.test("accepts an explicitly configured model identifier", () => {
  assertEquals(resolveConfiguredModel("gpt-verified-model"), "gpt-verified-model");
});

Deno.test("trims surrounding whitespace from configured model", () => {
  assertEquals(resolveConfiguredModel("  gpt-verified-model  "), "gpt-verified-model");
});

Deno.test("fails closed when model is unset", () => {
  assertEquals(resolveConfiguredModel(undefined), null);
});

Deno.test("fails closed when model is blank or whitespace", () => {
  assertEquals(resolveConfiguredModel(""), null);
  assertEquals(resolveConfiguredModel("   "), null);
});
