# ZAVQERA hosted Development migration-parity audit — W66–W79

**Audit date:** 2026-10-12  
**Branch:** `zavqera/ai-planner-integration`  
**Original audit snapshot HEAD:** `65e96a8c1dba8150b023ac0581f5db1543ba750e`  
**Superseding verified candidate HEAD:** see the latest status section in `docs/ZAVQERA_LAUNCH_GATES_STATUS.md`.  
**Hosted project:** ZAVQERA Development, `mrwmmbytcymqgwvcoywd`, PostgreSQL 17  
**Scope:** Read-only comparison of repository migrations and hosted Development catalog/ledger.  
**Explicitly not authorized by this document:** applying migrations, changing Supabase Main/Production, enabling a live Research call, registering a real provider, or promoting/merging the release candidate.

## 1. Finding

The hosted Development migration ledger ends at:

- `20261011150000_w65_agent_execution_table_write_boundary`

The repository branch contains these later database migrations that are absent from the hosted ledger:

| Version | Migration | Main responsibility | Dependency / acceptance focus |
|---|---|---|---|
| 20261011160000 | W66 service-role table privilege hardening | Revokes direct table privileges from `service_role` on `agent_executions` | Must be followed by proof that intended guarded RPCs still work and direct writes are denied |
| 20261011165000 | W67 legacy Research RPC privilege hardening | Revokes API-role EXECUTE on both legacy six-argument Research completion functions before the remaining rollout | Must prove `anon`, `authenticated`, and `service_role` cannot invoke either legacy overload during a partial rollout; Research stays intentionally unavailable until W79 |
| 20261011170000 | W68 persistent authority budget reservations | Adds persistent authority budgets/reservations and atomic budget-aware execution start | Depends on workspace/mission/agent/execution/approval contracts; verify counters, constraints, RLS and atomic race tests |
| 20261011180000 | W69 one-time JIT dispatch claim | Adds dispatch-claim fields and the one-time just-in-time claim RPC | Depends on W68 reservation state; validate authority/approval/version/lease/hash binding and replay denial |
| 20261011190000 | W70 durable unknown-outcome reconciliation | Adds durable reconciliation claim/lease/token and settlement RPC | Depends on W68 reservation ledger and W69 execution fields; unknown outcomes must not redispatch |
| 20261012070000 | W71 expired external execution budget recovery | Holds a stale execution's reservation as `HELD_UNKNOWN` before reconciliation | Depends on W68–W70 state semantics; prove lock ordering and recovery without releasing uncertain spend |
| 20261012120000 | W73 trusted system mission events | Allows a narrowly allowlisted trusted worker to append validated SYSTEM events | Depends on execution/claim/reservation state; verify service-role event path and prevent user-attribution spoofing |
| 20261012130000 | W74 reconciliation claim freshness | Requires settlement evidence to post-date the active reconciliation claim | Depends on W70 claim tokens and W73 event model; stale evidence must fail closed |
| 20261012140000 | W75 correlatable provider receipt | Requires stable provider reference for successful external side effects | Depends on the execution evidence schema; generic success/provider labels are insufficient |
| 20261012150000 | W76 guard external success on insert | Enforces W75 receipt invariant on INSERT and UPDATE | Must reject invalid success records regardless of which trusted writer inserts them |
| 20261012160000 | W77 read-only research payload bounds | Bounds and allowlists authenticated read-only Research completion payloads | Depends on W64 completion contract and current execution schema; enforce limits and valid source shape |
| 20261012170000 | W78 bind research history to execution | Binds Research history event to the exact completed execution and matching summary/source metadata | Depends on W73 SYSTEM event handling and W77 Research result shape; cross-execution or altered history must fail |
| 20261012180000 | W79 trusted research completion | Removes older public/private completion signatures and installs a requester-bound trusted completion function | Depends on W77/W78 and worker route contract; verify exact 7-argument signature, grants, requester/execution binding, and fail-closed preflight |

W67 is now an explicit fail-closed SQL migration in this candidate branch. W72 remains persistent-gateway integration code/test, not a SQL migration; do not invent a W72 migration-ledger row.

## 2. Read-only hosted catalog evidence

The following checks were performed against Development and made no changes:

- Migration ledger: 74 entries, ending at W65.
- `public.mission_authority_budgets`: absent.
- `public.mission_authority_budget_reservations`: absent.
- `public.agent_executions`: exists, but the W69 dispatch-claim and W70 reconciliation-claim columns queried in the audit are absent.
- The hosted completion function remains on the older W64 contract; the W79 trusted requester-bound signature is not present.

Therefore, the W79 preflight must remain fail-closed. A green isolated PostgreSQL 17 replay proves that the branch migrations work in the disposable test environment; it does not establish that the hosted Development schema is current.

## 3. Required ordered rollout — only after separate explicit authorization

Do not run this rollout until the repository owner has explicitly authorized the hosted Development schema change, superseding the guardrail in Issue #23 for this exact project and migration range. Approval to inspect or to prepare a plan is not approval to apply migrations.

Apply using the repository's reviewed migration runner in strict timestamp order:

1. W66
2. W67
3. W68
4. W69
5. W70
6. W71
7. W73
8. W74
9. W75
10. W76
11. W77
12. W78
13. W79

Do not run ad hoc SQL to imitate migrations and do not manually insert rows into the migration ledger. W79 deliberately drops older completion-function signatures; this is an API-contract change and must be verified against the exact deployed worker route. Never skip directly to W79.

## 4. Preflight checks before an authorized rollout

- Confirm the project identifier is exactly `mrwmmbytcymqgwvcoywd` (Development); never use a Main/Production project.
- Re-read the hosted migration ledger and catalog immediately before the rollout; abort if state differs from this audit.
- Confirm a recoverable backup/restore path and that the owner accepts the risk of schema changes. Do not claim rollback is automatic: several changes replace functions/triggers or revoke privileges, and W79 drops legacy function signatures.
- Confirm current branch migration files and their checksums/reviewed contents match the audited commit.
- Confirm no live Research marker or authenticated live Research workflow will be triggered as a side effect.
- Run only the repository migration runner, in timestamp order. Stop immediately on the first failure; do not continue, retry blindly, or edit the ledger to bypass it.

## 5. Post-migration acceptance matrix

After every migration reports success, perform read-only catalog verification and isolated tests before considering any live Research test:

- **Ledger:** every expected version through W79 appears exactly once; no skipped or hand-written rows.
- **W66:** direct `service_role` table mutation is denied while intended guarded functions remain callable.
- **W67:** the legacy public/private six-argument completion functions are either absent (after W79) or non-executable by `anon`, `authenticated`, and `service_role`; a partial rollout must fail closed.
- **W68:** tables, constraints, privileges, and reservation relationships match source; concurrent starts cannot exceed action/spend budgets.
- **W69:** one execution can acquire at most one valid dispatch claim; altered authority/action hashes, stale approvals, expired leases and replays fail closed.
- **W70–W71:** reconciliation claim leases/tokens are enforced; unknown outcomes remain held and are never blindly redispatched; stale recovery preserves budget accounting.
- **W73–W74:** only allowlisted trusted SYSTEM events can be recorded, and reconciliation evidence must be fresh for the active claim.
- **W75–W76:** an external-side-effect success without a stable provider receipt is rejected on both insert and update.
- **W77–W78:** Research payload size/source allowlists and execution/history binding are enforced; users cannot forge or cross-bind history.
- **W79:** only the trusted completion route can finalize; the seven-argument requester-bound signature and grants match the application route; the old public and private signatures are absent.
- **W79 preflight:** schema probe returns READY only for the exact expected signature; missing schema, permission errors, network errors or unexpected SQL errors fail closed before quota reservation/provider spend.
- **Regression:** run Web Unit, Web CI/build, W25 and W21 on the exact code SHA. Preserve the evidence artifacts and cleanup proof.

Only after these checks pass may a separately authorized Development-only live Research test be considered. That test writes persistent data and is not part of migration rollout.

## 6. Stop conditions and release status

Stop and leave Research blocked if any migration fails, the ledger/catalog does not match the expected state, function grants differ from source, any regression test fails, or the exact W79 preflight is not READY.

This audit is a plan and evidence record, not deployment authorization. It does not close Issue #23's full Mission Authority acceptance matrix and does not certify a universal provider-neutral JIT boundary. PR #29 must remain OPEN / Draft / Unmerged; no production promotion is approved.

**Current result: HOSTED PARITY FAIL / ROLLOUT NOT AUTHORIZED.**

## 7. Superseding CI and W67 regression update — 2026-10-12

- Candidate commit `d4da141580b027752fff3830594d35b562aca7df` added `supabase/tests/w67_legacy_research_rpc_privilege_hardening.sql` to the W21 isolated PostgreSQL 17 replay. The test checks that neither `anon`, `authenticated`, nor `service_role` can execute either legacy six-argument function in the intermediate W67 state.
- W21 Local Launch Gate completed **SUCCESS** on that candidate commit, including the migration replay, security/concurrency steps, browser E2E, disposable-stack cleanup, and uploaded evidence artifacts: [W21 run](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38280173757), [evidence and cleanup proof](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38280173757/artifacts/11760488823), [browser diagnostics](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/38280173757/artifacts/11760593533).
- Web Unit, Web CI, Flutter CI, W25, and the Netlify workflow also completed successfully on that commit. These are candidate/isolated-environment results, not proof of hosted Development parity or live Research success.
- The hosted Development catalog remains unchanged at W65 as of the latest read-only check. W67 has **not** been applied to the hosted project; the legacy function grants remain a live integrity concern until separately authorized remediation and post-change catalog verification.
- Current status remains **HOSTED PARITY FAIL / ROLLOUT NOT AUTHORIZED**. PR #29 remains OPEN / Draft / Unmerged.
