# W21 — Authenticated Mission Lifecycle and Backup Browser E2E Evidence

**Latest full-suite result:** PASS  
**Workflow run:** [41244037033](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/41244037033)  
**Pull request:** [#54](https://github.com/abdalrhmanata-gif/Nexo/pull/54)  
**Run date:** 2026-10-31  
**PR head tested:** `611361b5125aa6cf204c2ecc829e596973a105b9`  
**Merge SHA checked out by Actions:** `ae966728d445aaa02c96cb2e9b9e6f05b0ac99f3`

## Latest full authenticated browser suite

Playwright completed **2 passed (3.3m)** with `e2e_exit_status=0`.

1. **Disposable full Mission loop:** authenticated sign-up/sign-in, workspace bootstrap, Mission creation, action lifecycle and follow-up persistence, verification, pending-work refusal, verified outcome commit, immutable idempotent outcome replay, second-user isolation, and append-only history protection.
2. **Opportunity Intelligence backup:** authenticated export, import/merge, collision protection, malformed/unsafe/duplicate/oversized file rejection, and mobile-width control reachability.

The W22 replay check deliberately sends different but valid retry data after the Mission has completed. The API returns the exact original outcome record; the persisted outcome row, Mission state, and event rows remain unchanged. The test also attempts the outcome RPC directly as a second authenticated user and exercises the HTTP route from that user's browser context.

The history-delete check inspects the first HTTP response without following redirects and verifies the Mission is retained with the provenance-protection destination. The SQL error classifier covers the snapshot's foreign-key restriction and the append-only/action-history trigger codes.

## Sanitized runtime evidence

| Field | Recorded value |
|---|---|
| Node | v22.23.4 |
| npm | 10.9.9 |
| Supabase CLI | 2.119.0 |
| Playwright | 1.55.1 |
| PostgreSQL | 17 |
| E2E exit status | 0 |
| Cleanup | VERIFIED |
| Destroyed fixture users | 4 |
| Destroyed fixture Missions | 1 |
| Destroyed fixture actions | 4 |
| Destroyed fixture verifications | 1 |
| Destroyed fixture outcomes | 1 |
| Schema fixture SHA-256 | `825380ef96ae4cf71648343b2644429c79232d462ada4bde3fbfdc2c97f9db64` |
| W22 migration SHA-256 | `20781176baba3298a1997a8dcf9fe8c99c14d75cbd1ccc50a6acbfbd16608f57` |

The sanitized evidence artifact is `zavqera-w21-evidence` (artifact ID `13059360196`, archive digest `sha256:d3a0cb016c2f0f0c57283d3f968a036fe23f42a2c4fbe1cadedffd1f297450e0`). The ledger confirms that no Docker container or volume carries the disposable project label after teardown.

No hosted Supabase Development/Main endpoint, service-role credential, provider credential, or external provider API was used.

## Earlier focused backup runs

The initial focused backup case passed on three earlier PR heads:

- [Run 41235256700](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/41235256700): **1 passed (2.3m)**; cleanup VERIFIED; artifact 13055555157.
- [Run 41235694988](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/41235694988): **1 passed (2.4m)**; cleanup VERIFIED; artifact 13055835867.
- [Run 41236047608](https://github.com/abdalrhmanata-gif/Nexo/actions/runs/41236047608): **1 passed (2.4m)**; cleanup VERIFIED; artifact 13055387271.

The latest run expands coverage beyond those focused backup-only runs.

## Network-isolation regression

The final browser guard permits equivalent loopback hostnames (`127.0.0.1`, `localhost`, `::1`) only on the exact local application and disposable Supabase ports. A unit test verifies that other local ports, HTTPS origins, and external hosts remain refused. This addresses the observed `localhost:3210` alias without broadening access beyond the two explicitly configured local services.

## Scope limits

This is authenticated browser evidence against a disposable local schema fixture. It is not a human usability study and does not certify hosted Development schema parity, production RLS/GRANT enforcement, production Mission Authority concurrency or cross-process TOCTOU, recovery reconciliation, real-provider settlement/receipt authenticity, billing, or a universal production egress boundary.

The W25 PostgreSQL atomic-fence proof is tracked separately in [PR #53](https://github.com/abdalrhmanata-gif/Nexo/pull/53). The broader disposable fake-provider Mission Authority launch-gate evidence is tracked separately in [PR #39](https://github.com/abdalrhmanata-gif/Nexo/pull/39); it does not substitute for production deployment or real-provider evidence.

Keep provider execution fail-closed and the release decision **NO-GO** until the remaining production gates are independently proven. This evidence does not authorize hosted changes, migration application, deployment, provider activation, or merging.
