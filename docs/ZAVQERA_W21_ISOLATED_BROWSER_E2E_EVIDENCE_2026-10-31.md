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

## Repeat verification on subsequent PR heads

After the first successful run, the W21 workflow was run twice more:

- [Run 41235694988](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/41235694988), PR head `59eff40b93fb2d56c3b8ceaeaaad7db3e4b471d5`, merge ref `ea6ca6b081822c07443ec74e388ee57131571818): **1 passed (2.4m)**; exit status 0; cleanup VERIFIED. Artifact ID `13055835867`, digest `sha256:c70308eed5090eb31aa6e789b994bdeac4c35b0850cc237cfdee0594d795c418`.
- [Run 41236047608](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/41236047608), PR head `19a7a817e6c70a26d1c3085c443fc50fc856d321), merge ref `179ca610af9701ccb3702b0e057f64a894c3516e`: **1 passed (2.4m)**; exit status 0; cleanup VERIFIED. Artifact ID `13055387271`, digest `sha256:1e26f97fecbd2b08a15b0dc5a87a411ae21ea0fe48c34a223fbf2142e53839d6`.

Both repeat runs again reported two destroyed users and no remaining Docker container or volume with the disposable project label. Both used the same schema fixture SHA-256 and runtime versions recorded above.

These repeats confirm the isolated browser workflow and its cleanup path across multiple updates to the PR.

## Scope limits

This is a real authenticated browser test against the disposable local schema fixture. It does not constitute a human usability round, nor does this focused backup test prove the entire Mission lifecycle, production RLS/GRANT enforcement, Mission Authority concurrency, cross-process TOCTOU behavior, recovery reconciliation, provider settlement or billing.

The local E2E harness and workflow retain their fail-closed rules. The evidence is not permission to run against a hosted project or to weaken append-only history protections.
