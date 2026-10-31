# W21 — Focused authenticated browser E2E evidence

**Result:** PASS  
**Workflow run:** [41235256700](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/41235256700)  
**Pull request:** [#54](https://github.com/abdalrhmanata-gif/Nexo/pull/54)  
**Run date:** 2026-10-31  
**PR head tested:** `6ee6dc0d1ec9ff1192d04434b52d9f474bb010f9`  
**Merge ref checked out by Actions:** `205ed999c909f9e12725c47e05cb6a1c97054a77`

## What ran

The existing Playwright case completed:

`authenticated Opportunity Intelligence backup flow exports, imports, and rejects unsafe files`

Result: **1 passed (2.3m)**.

The test signs up two fresh synthetic users in a disposable local Supabase stack and exercises the Opportunity Intelligence backup flow, including export, import/merge behavior, collision protection and unsafe/malformed backup rejection. Network guards are installed on both browser contexts.

## Environment and sanitized evidence

| Field | Recorded value |
|---|---|
| Node | v22.23.4 |
| npm | 10.9.9 |
| Supabase CLI | 2.119.0 |
| Playwright | 1.55.1 |
| PostgreSQL | 17 |
| E2E exit status | 0 |
| Cleanup | VERIFIED |
| Destroyed fixture users | 2 |
| Schema fixture SHA-256 | `825380ef96ae4cf71648343b2644429c79232d462ada4bde3fbfdc2c97f9db64` |

The sanitized GitHub Actions evidence artifact is `zavqera-w21-evidence` (artifact ID `13055555157`). Its contents record `result=success`, `e2e_exit_status=0` and `cleanup=VERIFIED`.

The teardown ledger reported that no Docker container or volume carried the disposable project label. No hosted Supabase Development/Main endpoint, service-role credential, provider credential or external API was used by this run.

## Repeat verification on the evidence-document PR head

After this evidence document was committed, the workflow ran again on PR head `59eff40b93fb2d56c3b8ceaeaaad7db3e4b471d5`:

- [W21 workflow run 41235694988](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/41235694988) — PASS.
- Result: **1 passed (2.4m)**; `e2e_exit_status=0`; `cleanup=VERIFIED`.
- The second teardown again reported two destroyed users and no remaining Docker container or volume with the disposable project label.
- Sanitized artifact `zavqera-w21-evidence`, ID `13055835867`, digest `sha256:c70308eed5090eb31aa6e789b994bdeac4c35b0850cc237cfdee0594d795c418`.
- Second evidence record used merge ref `ea6ca6b081822c07443ec74e388ee57131571818` and the same schema SHA-256 recorded above.

This repeat confirms that adding the permanent evidence document did not break the isolated browser workflow.

## Scope limits

This is a real authenticated browser test against the disposable local schema fixture. It does not constitute a human usability round, nor does this focused backup test prove the entire Mission lifecycle, production RLS/GRANT enforcement, Mission Authority concurrency, cross-process TOCTOU behavior, recovery reconciliation, provider settlement or billing.

The local E2E harness and workflow retain their fail-closed rules. The evidence is not permission to run against a hosted project or to weaken append-only history protections.
