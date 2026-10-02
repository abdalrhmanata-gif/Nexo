import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const migration = readFileSync(
  path.join(root, "supabase/migrations/20261002180000_w27_ai_usage_search_path_hardening.sql"),
  "utf8",
);

test("AI usage SECURITY DEFINER functions prioritize pg_catalog in search_path", () => {
  for (const signature of [
    "public.get_ai_usage()",
    "public.reserve_ai_generation(text)",
    "public.consume_ai_generation(uuid)",
    "public.release_ai_generation(uuid)",
  ]) {
    assert.match(migration, new RegExp(
      `alter\\s+function\\s+${signature.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\s+set\\s+search_path\\s*=\\s*pg_catalog\\s*,\\s*public\\s*;`,
      "i",
    ), `missing hardened search_path for ${signature}`);
  }
});
