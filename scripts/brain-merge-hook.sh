#!/usr/bin/env bash
set -euo pipefail
SRC="${1:-.}"; DEST="${2:-./raw}"
MANIFEST="$DEST/.manifest.json"
mkdir -p "$DEST"
if [ -f "$SRC" ]; then
  cp "$SRC" "$DEST/$(basename "$SRC")"
else
  find "$SRC" -name '*.md' -type f | while read -r f; do
    rel="${f#$SRC/}"
    mkdir -p "$(dirname "$DEST/$rel")"
    cp "$f" "$DEST/$rel"
  done
fi
jq -n --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  '{timestamp: $ts, files: []}' > "$MANIFEST"
