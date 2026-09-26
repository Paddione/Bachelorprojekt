#!/usr/bin/env bash
# plan-runner-fake-opencode.sh — Stub fuer `opencode run` in tests/spec/llm-local-dev/plan-runner.bats (T900504).
# Aufruf wie opencode: run --agent <agent> --dir <worktree> <prompt>
# Schlaeft FAKE_SLEEP_4B (Agent qwen35-mtp) bzw. FAKE_SLEEP_SELF (Agent local) Sekunden,
# schreibt danach "<agent> <partial-id>" nach FAKE_OPENCODE_LOG und meldet Erfolg.
set -euo pipefail
agent=""; prev=""
for a in "$@"; do
  [ "$prev" = "--agent" ] && agent="$a"
  prev="$a"
done
prompt="${*: -1}"
partial="$(grep -oE 'Partial-ID: [A-Za-z0-9_-]+' <<<"$prompt" | head -1 | cut -d' ' -f2 || true)"
case "$agent" in
  qwen35-mtp) sleep "${FAKE_SLEEP_4B:-0}" ;;
  local) sleep "${FAKE_SLEEP_SELF:-0}" ;;
esac
echo "$agent ${partial:-unknown}" >> "${FAKE_OPENCODE_LOG:?FAKE_OPENCODE_LOG not set}"
echo "working on ${partial:-unknown}"
echo "PLAN-RUNNER-RESULT: success fake"
