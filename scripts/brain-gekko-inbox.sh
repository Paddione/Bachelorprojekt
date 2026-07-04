#!/usr/bin/env bash
set -euo pipefail
SRC="${1:?source file}"; DEST="${2:?wiki dir}"; TITLE=""; TAGS=""
[ -f "$SRC" ] || { echo "source not found: $SRC" >&2; exit 1; }
while [[ $# -gt 0 ]]; do
  case "$1" in
    --title) TITLE="$2"; shift ;;
    --tags)  TAGS="$2"; shift ;;
  esac; shift
done
SLUG="$(basename "$SRC" .md | tr '[:upper:]' '[:lower:]' | sed 's/ /-/g')"
OUT="$DEST/$SLUG.md"
[ -f "$OUT" ] && { echo "exists: $OUT" >&2; exit 1; }
cat > "$OUT" <<EOF
---
type: note
title: ${TITLE:-$SLUG}
tags: [${TAGS:-inbox}]
status: draft
---

$(cat "$SRC")
EOF
echo "created: $OUT"
