import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(testDir, "..");
const adminSource = readFileSync(path.join(webRoot, "lib/supabase/admin.ts"), "utf8");
const envExample = readFileSync(path.join(webRoot, ".env.example"), "utf8");

test("admin RPC client uses the documented server-side Supabase key", () => {
  assert.match(
    adminSource,
    /process\.env\.ZAVQERA_SERVER_DB_KEY\s*\|\|\s*process\.env\.SUPABASE_SERVICE_ROLE_KEY/,
  );
  assert.match(envExample, /^ZAVQERA_SERVER_DB_KEY=$/m);
  assert.doesNotMatch(envExample, /^NEXT_PUBLIC_.*(?:SERVICE_ROLE|SERVER_DB_KEY)/m);
});

test("admin RPC client remains fail-closed when URL or server key is missing", () => {
  assert.match(adminSource, /if \(!supabaseUrl \|\| !serviceRoleKey\)/);
  assert.match(adminSource, /TRUSTED_EXECUTION_NOT_CONFIGURED/);
});
