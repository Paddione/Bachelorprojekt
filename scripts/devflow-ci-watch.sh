#!/usr/bin/env bash
# devflow-ci-watch.sh — Backward-compatible wrapper for scripts/devflow_ci_watch.py
# T014466: gh run list bindet den Run-Lookup an den PR-Branch, nicht an den lokalen Branch.
# T001408-M2: mergeStateStatus vor CI-Poll-Loop pruefen, rebase origin/main bei DIRTY.
# T001408-M3: gh pr view --json statusCheckRollup leitet fehlgeschlagene Checks ab.
# Phase-Gate (lokale phase-events.log) vor dem gruenen Exit.
set -u
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)" || exit 2
exec python3 "${SCRIPT_DIR}/devflow_ci_watch.py" "$@"
