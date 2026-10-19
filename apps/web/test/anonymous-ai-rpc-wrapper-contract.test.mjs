import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

const migrationPath = fileURLToPath(
  new URL("../../supabase/migrations/20261019193000_w83_anonymous_ai_rpc_public_invoker_wrappers.sql", import.meta.url),
);
const helperPath = fileURLToPath(
  new URL("../lib/anonymous-ai-usage.ts", import.meta.url),
);

const [migration, helper] = await Promise.all([
  readFile(migrationPath, "utf8"),
  readFile(helperPath, "utf8"),
]);

const rpcSignatures = [
  ["reserve_anonymous_ai_generation", "text, text, uuid"],
  ["consume_anonymous_ai_generation", "uuid"],
  ["release_anonymous_ai_generation", "uuid"],
];

test("anonymous quota calls use the public default schema and modern secret-key header contract", () => {
  assert.match(helper, /\/rest\/v1\/rpc\/\$\{name\}/);
  assert.match(helper, /apikey:\s*key/);
  assert.doesNotMatch(helper, /Authorization\s*:/);
  assert.doesNotMatch(helper, /Content-Profile\s*:/);
});

test("all public quota wrappers are SECURITY INVOKER and call schema-qualified private helpers", () => {
  for (const [name] of rpcSignatures) {
    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const wrapper = new RegExp(
      `create or replace function public\\.${escapedName}\\([\\s\\S]*?security invoker[\\s\\S]*?set search_path = pg_catalog[\\s\\S]*?as \\\$function\\\\\\$[\\s\\S]*?private\\.${escapedName}\\(`,
      "i",
    );
    assert.match(migration, wrapper, `expected least-privilege invoker wrapper for ${name}`);
  }
});

test("only service_role receives EXECUTE on the public wrappers", () => {
  for (const [name, args] of rpcSignatures) {
    const signature = `public.${name}(${args})`;
    assert.ok(
      migration.includes(`revoke all on function ${signature}\n  from public, anon, authenticated;`),
      `missing explicit revoke for ${signature}`,
    );
    assert.ok(
      migration.includes(`grant execute on function ${signature} to service_role;`),
      `missing service_role grant for ${signature}`,
    );
  }
});
