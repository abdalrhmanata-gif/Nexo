# NEXO CI Handoff

This package is ready to be placed in a Git repository and executed by GitHub Actions.

Expected first-run outcome:
- Static gate should pass based on the latest local evidence.
- The first unknowns are real Flutter formatting, analyzer, dependency resolution, and test results.
- Any failure must be fixed only after the CI provides the actual error.

Current prepared package SHA256:
2b36daded8deb5c8134724f49b0d16ea95a77a6514ec2dd5dfbcb95e052d8901


## Latest hardening — v10
- Deterministic repository clock injection for lease-boundary tests.
- Expired active leases transition to `expired` and invalidate authority/actions.
- `resumeMission` requires `PAUSED` and a live lease.
- Mission Control load failure now exposes retry instead of an endless spinner.
- Runtime Flutter execution remains an external CI gate.
