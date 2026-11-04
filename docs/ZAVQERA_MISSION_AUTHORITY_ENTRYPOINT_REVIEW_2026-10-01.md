# ZAVQERA Mission Authority — Web Entry-Point Review (2026-10-01)

**Branch:** `zavqera/alternative-web-deployment`  
**Purpose:** Narrow follow-up to the source audit. This is a static review of the concrete web entry points retrieved below, not a complete repository-wide proof. No application code, database, deployment, or billing was changed.

## Retrieved source findings

| File | Directly observed behavior | Security interpretation |
|---|---|---|
| `apps/web/app/api/status/route.ts` | Public GET returns reachability, whether the Supabase URL and publishable key are configured, and whether the URL matches the Development host. It does not query or mutate application records. | Health/configuration signal only; not an authorization endpoint. It exposes configuration booleans, not secrets. The hard-coded Development-host check is not a substitute for deployment environment separation. |
| `apps/web/middleware.ts` | Calls Supabase `auth.getUser()`; redirects unauthenticated `/app` requests to sign-in and redirects authenticated users away from most `/auth/*` pages. Matcher covers `/app/:path*` and `/auth/:path*`. | UI navigation/session gate only. It does not authorize individual mission mutations or external side effects; API/worker handlers must independently validate identity and ownership. |
| `apps/web/test/e2e/preflight.mjs` | Calls read-only preflight and exits 2 when refused. Comments explicitly say it starts, creates, and destroys nothing. | Safe preflight is not an E2E result. |
| `apps/web/test/e2e/global-setup.mjs` | Checks static preconditions and tools, refuses an occupied port, destroys/verifies the disposable stack before start, verifies app target, and returns teardown that destroys and re-verifies the stack. | Strong isolation intent in harness code; still not proof it has executed successfully on an operator machine. |
| `apps/web/README.md` | Requires a disposable local Supabase stack and a schema-only snapshot from Development; expressly forbids hosted Development E2E and states this execution host lacks Docker/native Supabase CLI. | Follow the operator workflow; never weaken append-only history or substitute a hosted target to get a green run. |

## What this review does not establish

- It does not establish a complete list of all API route handlers, server actions, workers, provider adapters, or other side-effect entry points. Some candidate paths could not be retrieved by exact path; that is not evidence that no such files exist.
- It does not prove a production server-side JIT gateway exists, nor that every external side effect is routed through one.
- It does not establish that the public health route or middleware is a substitute for row-level security or per-operation server authorization.
- No test, build, Docker stack, or E2E browser run was executed in this review.

## Next safe implementation gate

Before changing code or schema, enumerate the actual tracked files under `apps/web/app`, server actions, provider/adapter packages, and all calls to external APIs or SDKs from the feature branch. For each call site, record: file/function, side-effect class, whether server-only, identity source, tenant/mission/action binding, authorization decision source, idempotency/reconciliation behavior, and tests. Then choose one narrow server-side seam and add negative tests against a fake adapter. Keep live credentials and hosted projects out of the test path.
