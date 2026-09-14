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

dart format --set-exit-if-changed lib test
flutter analyze
flutter test
