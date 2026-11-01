import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { getServerDbHeaders } from "../lib/anonymous-ai-rpc-headers.mjs";

const routePath = fileURLToPath(
  new URL("../app/api/ai/plan/anonymous/route.ts", import.meta.url),
);
const webWorkflowPath = fileURLToPath(
  new URL("../../../.github/workflows/web.yml", import.meta.url),
);
const netlifyWorkflowPath = fileURLToPath(
  new URL("../../../.github/workflows/web-deploy-netlify.yml", import.meta.url),
);

const migrationPath = fileURLToPath(
  new URL("../../../supabase/migrations/20261019193000_w83_anonymous_ai_rpc_public_invoker_wrappers.sql", import.meta.url),
);
const helperPath = fileURLToPath(
  new URL("../lib/anonymous-ai-usage.ts", import.meta.url),
);

const [migration, helper, route, netlifyWorkflow, webWorkflow] = await Promise.all([
  readFile(migrationPath, "utf8"),
  readFile(helperPath, "utf8"),
  readFile(routePath, "utf8"),
  readFile(netlifyWorkflowPath, "utf8"),
  readFile(webWorkflowPath, "utf8"),
]);
const normalizedMigration = migration.replace(/\r\n/g, "\n");

const rpcSignatures = [
  ["reserve_anonymous_ai_generation", "text, text, uuid"],
  ["consume_anonymous_ai_generation", "uuid"],
  ["release_anonymous_ai_generation", "uuid"],
];

test("server key header policy is exercised at runtime for modern and legacy Supabase keys", () => {
  const modernKey = "sb_secret_runtime-test";
  assert.deepEqual(getServerDbHeaders(modernKey), {
    apikey: modernKey,
    "Content-Type": "application/json",
  });
  assert.equal("Authorization" in getServerDbHeaders(modernKey), false);

  const legacyKey = "eyJheader.payload.signature";
  assert.deepEqual(getServerDbHeaders(legacyKey), {
    apikey: legacyKey,
    "Content-Type": "application/json",
    Authorization: `Bearer ${legacyKey}`,
  });

  assert.throws(
    () => getServerDbHeaders("unsupported-key-format"),
    { message: "ANONYMOUS_AI_GUARD_UNAVAILABLE" },
  );
});

test("anonymous quota RPC caller remains server-only and uses the public default schema", () => {
  assert.match(helper, /^import ["\']server-only["\'];/);
  assert.match(helper, /\/rest\/v1\/rpc\/\$\{name\}/);
  assert.match(helper, /getServerDbHeaders\(key\)/);
  assert.doesNotMatch(helper, /Content-Profile\s*:/);
});

test("all public quota wrappers are SECURITY INVOKER and call schema-qualified private helpers", () => {
  for (const [name] of rpcSignatures) {
    const start = normalizedMigration.indexOf(`create or replace function public.${name}(`);
    assert.notEqual(start, -1, `missing public wrapper for ${name}`);
    const next = normalizedMigration.indexOf("\ncreate or replace function", start + 1);
    const block = normalizedMigration.slice(start, next === -1 ? normalizedMigration.length : next);
    assert.match(block, /security invoker/i, `${name} must be SECURITY INVOKER`);
    assert.match(block, /set search_path = pg_catalog/i, `${name} must pin search_path`);
    assert.ok(block.includes(`private.${name}(`), `${name} must call its private implementation`);
  }
});

test("only service_role receives EXECUTE on the public wrappers", () => {
  for (const [name, args] of rpcSignatures) {
    const signature = `public.${name}(${args})`;
    assert.ok(
      normalizedMigration.includes(`revoke all on function ${signature}\n  from public, anon, authenticated;`),
      `missing explicit revoke for ${signature}`,
    );
    assert.ok(
      normalizedMigration.includes(`grant execute on function ${signature} to service_role;`),
      `missing service_role grant for ${signature}`,
    );
  }
});

test("anonymous quota release is confirmed and failed settlement is logged without sensitive data", () => {
  const releaseStart = helper.indexOf("export async function releaseAnonymousAiGeneration(");
  assert.notEqual(releaseStart, -1);
  const releaseBlock = helper.slice(releaseStart);
  assert.match(
    releaseBlock,
    /if \(data !== true\) throw new Error\("ANONYMOUS_AI_GUARD_UNAVAILABLE"\);/,
  );
  assert.match(
    route,
    /try \{\s*await releaseAnonymousAiGeneration\(reservationId\);\s*\} catch \{\s*\/\/ Keep the reservation held unless release is positively confirmed\.\s*\/\/ Log only a fixed diagnostic; never include visitor or provider data\.\s*console\.error\("ANONYMOUS_AI_RESERVATION_RELEASE_NOT_CONFIRMED"\);\s*\}/,
  );
  assert.doesNotMatch(
    route,
    /console\.error\([^)]*(?:visitorToken|reservationId|apiKey|salt)/i,
  );
});

test("Netlify previews target the current PR and smoke-test anonymous routing without providers", () => {
  assert.doesNotMatch(netlifyWorkflow, /deploy-preview-29/);
  assert.match(
    netlifyWorkflow,
    /deploy-preview-\$\{\{ github\.event\.pull_request\.number \}\}/,
  );
  assert.equal(
    (netlifyWorkflow.match(/anonymous_ai_route_preview_smoke=PASS/g) ?? []).length,
    2,
  );
  assert.equal((netlifyWorkflow.match(/--data '\{\}'/g) ?? []).length, 2);
  assert.equal(
    (netlifyWorkflow.match(/if \[ "\$\{anonymous_status\}" != "400" \]; then/g) ?? []).length,
    2,
  );
  assert.equal(
    (netlifyWorkflow.match(/provider_and_database_calls=0/g) ?? []).length,
    2,
  );
});

test("Web CI audits full and production dependency trees and blocks high or critical findings", () => {
  assert.match(webWorkflow, /npm audit --json/);
  assert.match(webWorkflow, /npm audit --omit=dev --json/);
  assert.match(webWorkflow, /const critical = counts\\.critical \\?\\? 0;/);
  assert.match(webWorkflow, /const high = counts\\.high \\?\\? 0;/);
  assert.match(webWorkflow, /if \\(critical > 0 \\|\\| high > 0\\) process\\.exit\\(1\\);/);
});
