import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

const migrationPath = fileURLToPath(
  new URL("../../../supabase/migrations/20261019193000_w83_anonymous_ai_rpc_public_invoker_wrappers.sql", import.meta.url),
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

test("anonymous quota RPCs use the public default schema and support both Supabase server-key formats", () => {
  assert.match(helper, /\/rest\/v1\/rpc\/\$\{name\}/);
  assert.match(helper, /apikey:\s*key/);
  assert.match(helper, /key\.startsWith\("sb_secret_"\)\) return headers/);
  assert.match(helper, /key\.startsWith\("eyJ"\)/);
  assert.match(helper, /claims\.role !== "service_role"/);
  assert.match(helper, /headers\.Authorization = `Bearer \$\{key\}`/);
  assert.match(helper, /throw new Error\("ANONYMOUS_AI_GUARD_UNAVAILABLE"\)/);
  assert.doesNotMatch(helper, /Content-Profile\s*:/);
});

test("all public quota wrappers are SECURITY INVOKER and call schema-qualified private helpers", () => {
  for (const [name] of rpcSignatures) {
    const start = migration.indexOf(`create or replace function public.${name}(`);
    assert.notEqual(start, -1, `missing public wrapper for ${name}`);
    const next = migration.indexOf("\ncreate or replace function", start + 1);
    const block = migration.slice(start, next === -1 ? migration.length : next);
    assert.match(block, /security invoker/i, `${name} must be SECURITY INVOKER`);
    assert.match(block, /set search_path = pg_catalog/i, `${name} must pin search_path`);
    assert.ok(block.includes(`private.${name}(`), `${name} must call its private implementation`);
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
