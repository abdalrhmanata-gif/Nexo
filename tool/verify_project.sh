#!/usr/bin/env bash
set -euo pipefail

python3 tool/static_contract_check.py

if ! command -v flutter >/dev/null 2>&1; then
  echo "FLUTTER_EXECUTION_BLOCKED: Flutter SDK is not installed in this environment." >&2
  exit 20
fi

if ! command -v dart >/dev/null 2>&1; then
  echo "FLUTTER_EXECUTION_BLOCKED: Dart SDK is not installed in this environment." >&2
  exit 20
fi

flutter --version
dart --version
flutter pub get

if ! dart format --set-exit-if-changed lib test; then
  echo "DART_FORMAT_DIFF_BEGIN" >&2
  git diff -- lib/application/zavqera_ai_planner.dart lib/infrastructure/supabase_config.dart lib/ui/auth_screen.dart >&2
  echo "DART_FORMAT_DIFF_END" >&2
  exit 1
fi
flutter analyze
flutter test
