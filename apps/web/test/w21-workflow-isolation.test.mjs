import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const workflow = readFileSync(
  join(repoRoot, ".github", "workflows", "zavqera-w21-e2e.yml"),
  "utf8",
);

test("W21 can only test a disposable repository-migration stack", () => {
  assert.match(workflow, /^\s*workflow_dispatch:\s*$/m);
  assert.match(workflow, /^permissions:\s*\r?\n\s+contents:\s*read\s*$/m);
  assert.doesNotMatch(workflow, /\$\{\{\s*secrets\./i,
    "W21 must not receive repository or environment secrets");
  for (const credential of [
    "ZAVQERA_DEVELOPMENT_DB_URL",
    "SUPABASE_DEV_SERVICE_ROLE_KEY",
    "SUPABASE_ACCESS_TOKEN",
    "OPENAI_API_KEY",
    "RESEND_API_KEY",
    "NETLIFY_AUTH_TOKEN",
  ]) {
    assert.doesNotMatch(workflow, new RegExp(`(?:^|\\n)\\s*(?:-\\s*)?${credential}\\s*[:=]`, "i"),
      `W21 must not assign hosted or external credential ${credential}`);
  }
  assert.doesNotMatch(workflow, /mrwmmbytcymqgwvcoywd|supabase\.co|netlify\.app|api\.openai\.com|api\.resend\.com/i,
    "W21 must not target hosted Development, Production, or provider endpoints");
  assert.doesNotMatch(workflow, /\bsupabase\s+(?:link|db\s+(?:push|dump|pull))\b/i,
    "W21 must not link, dump, pull, or push a hosted database");
  assert.match(workflow, /cp -R "\$GITHUB_WORKSPACE\/supabase\/migrations\/." "\$workdir\/supabase\/migrations\/"/);
  assert.match(workflow, /supabase start[^\n]*--workdir "\$ZAVQERA_E2E_SUPABASE_WORKDIR"/);
  assert.match(workflow, /supabase test db/);
  assert.match(workflow, /ZAVQERA_AI_PROVIDER_MODE=mock/);
  assert.match(workflow, /unset NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
  assert.match(workflow, /supabase stop --no-backup --workdir "\$ZAVQERA_E2E_SUPABASE_WORKDIR"/);
  assert.match(workflow, /cleanup_verified=true/);
  assert.doesNotMatch(workflow, /netlify (?:deploy|build)|deploy-to-production|production-deploy/i);
});
