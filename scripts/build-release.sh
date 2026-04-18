#!/usr/bin/env bash
# Chrome MV3 extension zip for GitHub Releases (same exclusions as build-release.ps1).
# Usage: from repo root, bash scripts/build-release.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

VER="$(grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' manifest.json | head -1 | sed 's/.*"\([^"]*\)"$/\1/')"
if [[ -z "$VER" ]]; then
  echo "Could not read version from manifest.json" >&2
  exit 1
fi

DIST="$ROOT/dist"
mkdir -p "$DIST"
STAGING="$(mktemp -d)"
trap 'rm -rf "$STAGING"' EXIT

rsync -a \
  --exclude='.git/' \
  --exclude='.github/' \
  --exclude='.cursor/' \
  --exclude='node_modules/' \
  --exclude='dist/' \
  --exclude='temp_kr/' \
  --exclude='temp_kr2/' \
  --exclude='temp_kr_studio/' \
  --exclude='test-pages/' \
  --exclude='CWS/' \
  --exclude='browser-mcp/' \
  --exclude='docs/' \
  --exclude='tasks/' \
  --exclude='release-notes/' \
  --exclude='scripts/' \
  --exclude='.gitignore' \
  --exclude='build-sw.sh' \
  --exclude='changes.md' \
  --exclude='versions.txt' \
  --exclude='CHANGELOG.md' \
  --exclude='CHANGELOG_EN.md' \
  --exclude='debug.log' \
  "$ROOT/" "$STAGING/"

OUT="$DIST/autotest-recorder-${VER}.zip"
rm -f "$OUT"
(cd "$STAGING" && zip -r -q "$OUT" .)
echo "OK: $OUT ($(du -h "$OUT" | cut -f1))"
