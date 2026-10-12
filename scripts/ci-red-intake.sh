#!/usr/bin/env bash
# scripts/ci-red-intake.sh — Backward-compatible wrapper for scripts/ci_red_intake.py (T900759 / T901669)
set -u
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)" || exit 2
exec python3 "${SCRIPT_DIR}/ci_red_intake.py" "$@"
