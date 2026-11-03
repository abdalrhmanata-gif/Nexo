#!/usr/bin/env bash
set -euo pipefail

# Netlify's default build image does not provide Flutter. Pin the SDK to the
# same version used by the repository's Flutter CI workflow.
FLUTTER_VERSION="${FLUTTER_VERSION:-3.47.2}"
FLUTTER_HOME="${FLUTTER_HOME:-$HOME/.cache/zavqera/flutter-$FLUTTER_VERSION}"
FLUTTER_BIN="$FLUTTER_HOME/bin/flutter"

if [[ ! -x "$FLUTTER_BIN" ]]; then
  mkdir -p "$(dirname "$FLUTTER_HOME")"
  git clone --depth 1 --branch "$FLUTTER_VERSION" https://github.com/flutter/flutter.git "$FLUTTER_HOME"
fi

export PATH="$FLUTTER_HOME/bin:$PATH"

flutter --version
flutter config --enable-web

# This repository is currently a Flutter app without the generated web/
# platform scaffold. Generate only that platform in the ephemeral build
# workspace; do not commit generated platform files or mutate other targets.
if [[ ! -f web/index.html ]]; then
  flutter create . --platforms=web --project-name=nexo_followthrough
fi

flutter pub get
flutter build web --release --base-href /

test -s build/web/index.html
