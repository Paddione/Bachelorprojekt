#!/usr/bin/env bash
# devflow-ci-watch.sh — Backward-compatible wrapper for scripts/devflow_ci_watch.py
# T014466: gh run list bindet den Run-Lookup an den PR-Branch, nicht an den lokalen Branch.
set -u
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)" || exit 2
exec python3 "${SCRIPT_DIR}/devflow_ci_watch.py" "$@"
