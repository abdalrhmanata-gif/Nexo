# Owner-run isolated E2E checklist

**OWNER-RUN READY; browser execution NOT PERFORMED.**
Current host preflight exits 2 (missing opt-in/workdir); Docker/native CLI and
reviewed disposable schema setup remain prerequisites. No hosted fixtures made.
Full instructions: [web README](../apps/web/README.md) and
[runbook](ZAVQERA_LAUNCH_RUNBOOK.md#auth-and-isolated-full-loop-check).

1. Install/start Docker on the owner's trusted test machine; verify
   `docker version --format '{{.Server.Version}}'` succeeds. Observe vendor
   licensing; do not purchase or install infrastructure on others' behalf.
2. Install native Supabase CLI on PATH (`supabase --version`, interfaces checked
   with 2.119.0); a `.cmd`/npx shim alone does not satisfy the harness. In apps/web
   install Chromium with `npx playwright install chromium`. Restore locked app
   dependencies with `npm ci` only if the test machine has not installed them.
3. Create an external disposable workdir, e.g. `C:\zavqera-e2e`, then
   `supabase init --workdir C:\zavqera-e2e`. Never link it. Set project_id to
   `zavqera-e2e-local`, db major_version 17 and local email confirmations false.
4. Load exactly one owner-reviewed current Development schema-only public/private
   snapshot named `<14-digit timestamp>_development_schema.sql` as described in
   README. Exclude data, roles and managed auth schema; append only the documented
   application auth hook. Verify W20/W21 functions, policy and trigger. Never
   replay incomplete repository migrations or use a production backup here.
5. Create `C:\zavqera-e2e\ZAVQERA_E2E_DISPOSABLE` containing only
   `zavqera-e2e-local`. Explicitly consent to deletion of that local stack.
   In a fresh shell remove hosted/privileged environment and old E2E user vars;
   do not show their values. Ensure loopback port 3210 is free.
6. From apps/web run the commands below. Users/passwords are generated locally
   through real signup; never provide real-user credentials or a hosted URL.
7. Require verified teardown: harness ledger plus zero containers/volumes with
   `com.supabase.cli.project=zavqera-e2e-local`. After interruption use only the
   exact project cleanup commands in the runbook; never global Docker prune.
8. Record UTC, Git SHA, schema snapshot provenance/hash, CLI/Postgres/Playwright
   versions, test exit status, sanitized result and cleanup proof. **PASS** needs
   actual browser success and verified cleanup; exit 2 is **BLOCKED**, assertion
   failure is **FAIL**, unknown cleanup is **CLEANUP NOT VERIFIED**. Leave missing
   evidence empty, not assumed.

```powershell
$env:ZAVQERA_E2E_MODE = 'disposable-full-loop'
$env:ZAVQERA_E2E_SUPABASE_WORKDIR = 'C:\zavqera-e2e'
npm run test:e2e
```

Safeguards stay intact: Docker/native CLI, unlinked external workdir, consent
marker, local generated users, hosted/privileged credential rejection, local
origin allowlist, clean-before-start and verified teardown. Never retry a failed
preflight against Development or disable append-only history to clean fixtures.
Do not publish Playwright artifacts until checked for tokens/personal data.

Execution record (owner to fill): date ___; source SHA ___; schema provenance ___;
result ___; cleanup evidence ___; operator ___. No result is preselected.
