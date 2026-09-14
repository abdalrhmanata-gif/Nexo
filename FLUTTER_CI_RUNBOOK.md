# NEXO Flutter CI Runbook

## Official execution target
Flutter stable 3.47.2. The Flutter documentation currently reflects 3.47.2 and the SDK archive lists the 3.47 stable line for August 2026.

## Required gate sequence
1. `python3 tool/static_contract_check.py`
2. `flutter pub get`
3. `dart format --set-exit-if-changed lib test`
4. `flutter analyze`
5. `flutter test`

The canonical wrapper is:

```bash
./tool/verify_project.sh
```

## Local host
Install Flutter 3.47.2 and ensure both `flutter` and `dart` are on `PATH`, then from the repository root run:

```bash
./tool/verify_project.sh
```

## GitHub Actions
The repository workflow is `.github/workflows/flutter.yml`.
It uses `ubuntu-latest`, Flutter 3.47.2 stable, Flutter caching, and uploads a diagnostic bundle on failure.

## Safety
- No production Supabase credentials are required.
- Do not add `.env` files to CI.
- Do not run against Supabase Main for this gate.
- Do not convert compatibility database results into production certification.
