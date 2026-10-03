#!/usr/bin/env bash
# plan-runner-fake-opencode.sh — Stub fuer `opencode run` in tests/spec/llm-local-dev/plan-runner.bats (T900504).
# Aufruf wie opencode v2: run --agent <agent> [--model <provider/model>] <prompt>. Wie v2 lehnt der Stub
# --dir ab (T900729). Alle Argumente ausser dem Prompt landen zeilenweise in FAKE_OPENCODE_ARGS (optional).
# Schlaeft FAKE_SLEEP_4B (Agent plan-worker-qwen35) bzw. FAKE_SLEEP_SELF (Agent plan-worker-self) Sekunden,
# schreibt danach "<agent> <partial-id>" nach FAKE_OPENCODE_LOG und meldet Erfolg.
set -euo pipefail
agent=""; prev=""
for a in "$@"; do
  if [ "$a" = "--dir" ]; then echo "ERROR Unrecognized flag: --dir in command opencode run" >&2; exit 1; fi
  [ "$prev" = "--agent" ] && agent="$a"
  prev="$a"
done
prompt="${*: -1}"
[ -n "${FAKE_OPENCODE_ARGS:-}" ] && echo "${*:1:$#-1}" >> "$FAKE_OPENCODE_ARGS"
[ -n "${FAKE_OPENCODE_PWD:-}" ] && echo "$PWD" >> "$FAKE_OPENCODE_PWD"
partial="$(grep -oE 'Partial-ID: [A-Za-z0-9_-]+' <<<"$prompt" | head -1 | cut -d' ' -f2 || true)"
case "$agent" in
  plan-worker-qwen35) sleep "${FAKE_SLEEP_4B:-0}" ;;
  plan-worker-self) sleep "${FAKE_SLEEP_SELF:-0}" ;;
esac
echo "$agent ${partial:-unknown}" >> "${FAKE_OPENCODE_LOG:?FAKE_OPENCODE_LOG not set}"
echo "working on ${partial:-unknown}"
echo "PLAN-RUNNER-RESULT: success fake"
