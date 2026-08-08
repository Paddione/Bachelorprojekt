#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# scripts/resolve-image-digest.sh — Resolve image reference to SHA256 digest
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

IMAGE=""
OFFLINE=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --image)
      IMAGE="$2"
      shift 2
      ;;
    --offline)
      OFFLINE=1
      shift 1
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

if [[ -z "$IMAGE" ]]; then
  echo "Usage: scripts/resolve-image-digest.sh --image <image-ref> [--offline]" >&2
  exit 1
fi

if [[ "$OFFLINE" -eq 1 ]]; then
  # Explicit offline mode signaled
  exit 0
fi

# Online lookup via crane
if command -v crane >/dev/null 2>&1; then
  crane digest "$IMAGE"
else
  echo "ERROR: crane CLI is not installed but online lookup was requested." >&2
  exit 1
fi
