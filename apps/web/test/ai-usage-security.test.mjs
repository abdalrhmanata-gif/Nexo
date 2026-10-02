import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const migrations = [
  "20261002180000_w27_ai_usage_search_path_hardening.sql",
  "20261002183000_w28_all_definer_search_path_hardening.sql",
].map((file) => readFileSync(path.join(root, "supabase/migrations", file), "utf8"))
  .join(" ")
  .replace(/\s+/g, " ")
  .toLowerCase();

test("SECURITY DEFINER functions prioritize pg_catalog in search_path", () => {
  for (const statement of [
    "alter function public.get_ai_usage() set search_path = pg_catalog, public;",
    "alter function public.reserve_ai_generation(text) set search_path = pg_catalog, public;",
    "alter function public.consume_ai_generation(uuid) set search_path = pg_catalog, public;",
    "alter function public.release_ai_generation(uuid) set search_path = pg_catalog, public;",
    "alter function public.create_mission_with_actions(uuid, text, jsonb) set search_path = pg_catalog, public;",
    "alter function public.handle_new_user_profile() set search_path = pg_catalog, public;",
  ]) {
    assert.ok(migrations.includes(statement), `missing hardened search_path statement: ${statement}`);
  }
});
