# Web development

Run the local checks with `npm test`. It includes `test/e2e-harness.test.mjs`, which checks the browser harness's refusal rules, cleanup ordering and Playwright test discovery without starting Supabase, Docker or the app. The authenticated browser test itself never runs as part of `npm test`.

## Authenticated full-loop browser test

`npm run test:e2e` drives the real product through Chromium: sign-up and sign-in of two fresh users, sign-out protection, mission creation with first steps, adding an action, reopening from the workspace, the mission lifecycle (including a stale-version 409), waiting with a follow-up date that survives reload, resuming, completing and cancelling work, verification (refused before checking), the outcome (refused while work is pending, accepted once the rest is cancelled), idempotent outcome re-commit, cross-user isolation in the UI, API and database, and the refusal to delete a mission that has history.

### Why it never runs against Development

Mission history is append-only by design: `mission_events` blocks mission deletion (`ON DELETE RESTRICT`), actions with transition history cannot be deleted, and the history tables reject updates and deletes. A run against the Development project would therefore leave missions, history and auth users behind that no app-level credential can remove, and removing them would require weakening those protections. The harness refuses that target instead of pretending to clean up.

All fixtures are created in a **disposable local Supabase stack** whose entire Docker state is destroyed and verified gone before and after every run. User JWTs issued by that stack are not valid anywhere else.

### One-time operator setup

Requires running Docker, the native `supabase` CLI executable on `PATH` (command
interfaces checked with 2.119.0), and Chromium (`npx playwright install chromium`
from apps/web). A `.cmd` shim alone does not satisfy the shell-free runner.

1. Create a directory **outside this repository**, for example `C:\zavqera-e2e`, and run `supabase init --workdir C:\zavqera-e2e`. Never run `supabase link` in it.
2. In `C:\zavqera-e2e\supabase\config.toml`, set `project_id = "zavqera-e2e-local"` (it must match `zavqera-e2e-<lowercase suffix>`) and keep `[auth.email] enable_confirmations = false`, so sign-up returns a session. If you change `[api] port`, nothing else needs to change.
3. Create `C:\zavqera-e2e\ZAVQERA_E2E_DISPOSABLE` containing only `zavqera-e2e-local`. This file is the explicit consent that every container and volume labelled with that project id may be destroyed.
4. Give the stack the current Development schema. Do **not** copy or replay the repository migrations: Development's migration history differs from this repository and its W5 history tables were never committed here, so a replay would build a different database. The harness refuses unless `supabase\migrations` contains exactly one file named `<14-digit timestamp>_development_schema.sql`. The schema must come from Development. The project owner runs this read-only dump (it reads the schema only; never commit the file or paste the connection string anywhere):

   ```powershell
   supabase db dump --db-url "<Development connection string>" --schema public,private -f C:\zavqera-e2e\supabase\migrations\20000101000000_development_schema.sql
   ```

   Use the Development ref `mrwmmbytcymqgwvcoywd` only. Enter connection information
   privately through the owner's secure shell/secret mechanism, never in chat,
   source control or CI logs. Do not dump data or roles.
   Re-dump after W21 migration `20261001091146`; the snapshot must include
   `VERIFIED_OUTCOME_REQUIRED`, policy `missions_initial_state`, and trigger
   `mission_actions_completion_insert_guard`.

   The managed `auth` schema is intentionally excluded from this dump. Append
   the current Development application hook below to the same snapshot file
   (the `private.handle_new_user_profile` function is included in the dump).
   Do not dump/restore the managed auth schema or overwrite its system tables.

   ```sql
   CREATE TRIGGER on_auth_user_created
   AFTER INSERT ON auth.users FOR EACH ROW
   EXECUTE FUNCTION private.handle_new_user_profile();
   ```

   Re-dump whenever Development changes; compare the current function definitions,
   policies and grants in the W21 release checklist before claiming equivalent
   schema. The filename check alone does not establish snapshot fidelity. The
   completion checks in the browser test also fail on a pre-W21 snapshot.
   Keep `[db] major_version` aligned with Development. No old migration is
   reconstructed or remote history changed by this local snapshot approach.

### Running

```powershell
Remove-Item Env:NEXT_PUBLIC_SUPABASE_URL, Env:NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY -ErrorAction SilentlyContinue
$env:ZAVQERA_E2E_MODE = "disposable-full-loop"
$env:ZAVQERA_E2E_SUPABASE_WORKDIR = "C:\zavqera-e2e"
npm run test:e2e
```

Port `3210` on `127.0.0.1` must be free (override with `ZAVQERA_E2E_BASE_URL=http://127.0.0.1:<port>`); the harness never reuses an existing server.

### What the harness guarantees

- **Fail closed before any mutation.** `test/e2e/preflight.mjs` and the Playwright global setup refuse (exit code 2 for the preflight) unless the opt-in mode, the disposable workdir, its project id and marker file are all valid, the workdir is unlinked and outside the repository, Docker and the CLI respond, and the port is free. Service-role, secret-key, access-token and database-password variables, the removed `ZAVQERA_E2E_USER_*` variables, and any non-loopback `NEXT_PUBLIC_SUPABASE_URL` cause a refusal.
- **Cleanup is proven before it is relied on.** Setup runs `supabase stop --no-backup` and then checks with Docker that no container or volume carries the project label; only then does it run `supabase start`. If leftovers cannot be removed or Docker cannot be queried, nothing starts.
- **Only the disposable stack is reachable.** The app is started by the harness on loopback with the stack's URL and publishable key, must report through `/api/status` that it is configured and not targeting Development, and the browser aborts and fails on any request outside the app and stack origins.
- **Teardown always runs and is verified.** The app is stopped and the stack is destroyed and re-checked with Docker after every run, including failed runs. A teardown that cannot be verified fails the run, even if every test passed.
- **Exact-id tracking.** Every created user, mission, action, verification and outcome is recorded by UUID in a bounded ledger under the system temp directory and reported (ids and counts only) at teardown. No secret, password or key is printed.

### Limits

- If the process is killed hard, the local Docker volumes remain until the next run's preflight removes them, or until you run `supabase stop --no-backup --workdir C:\zavqera-e2e`. Nothing is ever left on a hosted project.
- Generated users and their profiles exist only in the disposable stack.
- On this execution host Chromium is installed, but Docker and a native Supabase
  executable on PATH are absent, and no isolated schema/workdir is configured.
  `npm run test:e2e` therefore remains BLOCKED, not PASS. The owner-run setup above
  is the accepted W21 alternative; it does not claim a browser run occurred.


## Transactional email invitations (Netlify Deploy Preview)

Workspace invitations are only reported as accepted after the email provider accepts the message. The invitation token is never returned by the API or persisted in plaintext.

To enable actual delivery in a Deploy Preview:

1. Create a Resend account and verify a domain you control. Use the sender address only after Resend has verified the domain's sending DNS records.
2. Create a server-side Resend API key restricted to sending email where the provider supports that permission. Never commit the key or paste it into chat.
3. In Netlify, open the site's environment-variable settings and add:
   - `RESEND_API_KEY`: the secret Resend API key.
   - `RESEND_FROM_EMAIL`: a sender such as `ZAVQERA <invites@your-verified-domain.com>` using the verified domain.
4. Scope these values to **Deploy Previews** while validating this PR. Do not change Production variables as part of this task.
5. Trigger a fresh Deploy Preview. The invitation API uses Netlify's `DEPLOY_PRIME_URL` as the link origin for previews, applies an idempotency key per stored invitation, and refuses to claim an email was delivered when provider configuration is missing or a request is rejected.

A successful provider API response confirms the message was accepted for sending; it does not prove it reached the recipient's inbox. Check provider event/log records for delivery, bounce, or suppression. If a network timeout makes the provider result ambiguous, the invitation stays pending so a link that may already have been emailed is not invalidated automatically.


## Authenticated live Mission research verification (Development-only)

The one-run live research test is deliberately separate from the local W21 gate and only runs for same-repository PR #29 when the PR body contains the temporary marker `[live-openai-research]`. It validates the actual Netlify Deploy Preview and the fixed ZAVQERA Development project before logging in or creating any Mission.

**Preferred setup: use a dedicated pre-provisioned Development test account rather than an Auth Admin secret.**

1. In the Supabase dashboard for **ZAVQERA Development** (`mrwmmbytcymqgwvcoywd`), create one dedicated test user in Authentication → Users. Mark it as email-confirmed so the test does not depend on invitation or confirmation-email delivery. Do not use a real person's account or any Production user.
2. Generate a unique, strong password for this test-only user. Do not commit or paste the credentials into source code, PR comments, logs or chat.
3. In GitHub repository Settings → Secrets and variables → Actions, add these repository secrets:
   - `SUPABASE_DEV_TEST_EMAIL`: the dedicated Development test user's email.
   - `SUPABASE_DEV_TEST_PASSWORD`: its generated password.
4. The workflow checks that both secrets are present without printing their values. The browser then signs in through the real application UI. A successful live research test creates a Mission and immutable research/audit history in Development; those records are intentionally retained as provenance and must not be deleted or cleaned by weakening database protections.
5. Do not run this marked workflow repeatedly: it creates another persisted Mission each time. Add the marker to PR #29 only for one intentional run, wait until the authenticated research job has started, then remove the marker. Verify that the workflow captured the marker before removing it.

The previous `SUPABASE_DEV_SERVICE_ROLE_KEY` path remains a fallback, but modern `sb_secret_…` keys are not legacy JWTs and may be rejected by the hosted Auth Admin mutation path. The pre-provisioned-account path avoids requiring a service-role key for the test. Either path is restricted to Development, and the test refuses to proceed if the Netlify preview or configured Supabase URL does not match the expected Development target.

The test proves live OpenAI research, actual public citations, persisted research history and source links after reload. It performs no external side effects. A successful plan-generation smoke test alone is not proof that live Mission research works.

