#!/bin/bash
# Copy docs/methods.md and its charts into frontend/ so Amplify (app root = frontend) can serve them.
# Run after editing docs/methods.md or regenerating docs/img/*.png, then commit.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
mkdir -p "$ROOT/frontend/content" "$ROOT/frontend/img"
cp "$ROOT/docs/methods.md" "$ROOT/frontend/content/methods.md"
cp "$ROOT"/docs/img/*.png "$ROOT/frontend/img/"
echo "synced methods.md and $(ls "$ROOT"/docs/img/*.png | wc -l) charts"
