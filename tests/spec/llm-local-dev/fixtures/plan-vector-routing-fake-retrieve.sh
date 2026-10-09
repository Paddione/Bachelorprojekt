#!/usr/bin/env bash
# plan-vector-routing-fake-retrieve.sh — Fake fuer `task context:retrieve` in
# tests/spec/llm-local-dev/plan-vector-routing.bats (T901542).
# Ersetzt das Recall-Binary via PLAN_RUNNER_RECALL_BIN (Analogon zu
# PLAN_RUNNER_OPENCODE in plan-runner/plan.mjs). Modi via Env:
#   FAKE_RECALL_MODE=ok    (Default) → canned Partial-Block auf stdout, exit 0
#   FAKE_RECALL_MODE=empty → leere Antwort, exit 0 (null Treffer)
#   FAKE_RECALL_MODE=fail → exit 1 (Backend-Ausfall)
# Argumente werden ignoriert (echtes `task context:retrieve -- ...` wird positions-
# transparent ersetzt).
set -euo pipefail
mode="${FAKE_RECALL_MODE:-ok}"
case "$mode" in
  ok)
    printf '%s\n' '## Retrieval-Kontext' '' '### `other-plan` — Stage-time-Indexierung' \
      'Fake Partial-Snippet: stage time index writes one chunk per partial.'
    ;;
  empty) : ;;
  fail) echo "fake retrieve backend down" >&2; exit 1 ;;
  *) echo "unknown FAKE_RECALL_MODE=$mode" >&2; exit 2 ;;
esac
