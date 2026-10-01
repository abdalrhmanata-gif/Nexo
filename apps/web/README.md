# Web development

Run the local checks with `npm test`. It includes `test/e2e-harness.test.mjs`, which checks the browser harness's refusal rules, cleanup ordering and Playwright test discovery without starting Supabase, Docker or the app. The authenticated browser test itself never runs as part of `npm test`.

## Authenticated full-loop browser test

`npm run test:e2e` drives the real product through Chromium: sign-up and sign-in of two fresh users, sign-out protection, mission creation with first steps, adding an action, reopening from the workspace, the mission lifecycle (including a stale-version 409), waiting with a follow-up date that survives reload, resuming, completing and cancelling work, verification (refused before checking), the outcome (refused while work is pending, accepted once the rest is cancelled), idempotent outcome re-commit, cross-user isolation in the UI, API and database, and the refusal to delete a mission that has history.

### Why it never runs against Development

Mission history is append-only by design: `mission_events` blocks mission deletion (`ON DELETE RESTRICT`), actions with transition history cannot be deleted, and the history tables reject updates and deletes. A run against the Development project would therefore leave missions, history and auth users behind that no app-level credential can remove, and removing them would require weakening those protections. The harness refuses that target instead of pretending to clean up.

All fixtures are created in a **disposable local Supabase stack** whose entire Docker state is destroyed and verified gone before and after every run. User JWTs issued by that stack are not valid anywhere else.

### One-time operator setup

Requires Docker and the native `supabase` CLI executable on `PATH`.

1. Create a directory **outside this repository**, for example `C:\zavqera-e2e`, and run `supabase init --workdir C:\zavqera-e2e`. Never run `supabase link` in it.
2. In `C:\zavqera-e2e\supabase\config.toml`, set `project_id = "zavqera-e2e-local"` (it must match `zavqera-e2e-<lowercase suffix>`) and keep `[auth.email] enable_confirmations = false`, so sign-up returns a session. If you change `[api] port`, nothing else needs to change.
3. Create `C:\zavqera-e2e\ZAVQERA_E2E_DISPOSABLE` containing only `zavqera-e2e-local`. This file is the explicit consent that every container and volume labelled with that project id may be destroyed.
4. Give the stack the current Development schema. Do **not** copy or replay the repository migrations: Development's migration history differs from this repository and its W5 history tables were never committed here, so a replay would build a different database. The harness refuses unless `supabase\migrations` contains exactly one file named `<14-digit timestamp>_development_schema.sql`. The schema must come from Development. The project owner runs this read-only dump (it reads the schema only; never commit the file or paste the connection string anywhere):

   ```powershell
   supabase db dump --db-url "<Development connection string>" -f C:\zavqera-e2e\supabase\migrations\20000101000000_development_schema.sql
   ```

   Re-dump whenever Development's schema changes. The harness checks only the file's presence and name; it cannot prove that the dump matches Development, and a stale dump can change what the test proves.

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
- Generated users only exist in the disposable stack. The auth-profile trigger lives in the `auth` schema, which `db dump` does not include; the app does not depend on it.
