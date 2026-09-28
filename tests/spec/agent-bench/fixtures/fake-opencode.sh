#!/usr/bin/env bash
# fixtures/fake-opencode.sh — Stub fuer `opencode run` in tests/spec/agent-bench/.
# Muster: tests/spec/llm-local-dev/fixtures/plan-runner-fake-opencode.sh.
# Aufruf wie opencode v2: run --agent <agent> [--model m] <prompt>, Arbeitsverzeichnis = cwd
# (--dir entfiel mit T900729; wird es noch uebergeben, gilt es weiter).
# (der Prompt ist grundsaetzlich das LETZTE Argument).
#
# Env:
#   FAKE_OPENCODE_LOG        Pflicht: haengt "<agent> <dir> <prompt-bytes>" + Prompt an.
#   FAKE_OPENCODE_SOLVE=1    Fuehrt $FAKE_OPENCODE_SNAP als Bash-Snippet in <dir> aus
#                            (simuliert die Loesung, damit checks/ gruen wird).
#   FAKE_OPENCODE_FAIL=1     Meldet PLAN-RUNNER-RESULT: failure statt success.
#   FAKE_OPENCODE_TESTFAIL=1 Druckt vorher eine FAILED-Zeile (fuer red_test_run).
#   FAKE_OPENCODE_SLEEP=n    Schlaeft n Sekunden.
set -euo pipefail
agent=""; dir=""; prev=""
for a in "$@"; do
  [ "$prev" = "--agent" ] && agent="$a"
  [ "$prev" = "--dir" ] && dir="$a"
  prev="$a"
done
dir="${dir:-$PWD}"
prompt="${*: -1}"
sleep "${FAKE_OPENCODE_SLEEP:-0}"
{
  echo "agent=${agent} dir=${dir} bytes=${#prompt}"
  printf '%s\n' "$prompt"
  echo "---end-prompt---"
} >> "${FAKE_OPENCODE_LOG:?FAKE_OPENCODE_LOG not set}"
if [ "${FAKE_OPENCODE_SOLVE:-0}" = "1" ] && [ -n "$dir" ] && [ -n "${FAKE_OPENCODE_SNAP:-}" ]; then
  (cd "$dir" && eval "$FAKE_OPENCODE_SNAP")
fi
if [ "${FAKE_OPENCODE_TESTFAIL:-0}" = "1" ]; then
  echo "FAILED utils_test (first attempt, then fixed)"
fi
echo "working in ${dir:-unknown}"
if [ "${FAKE_OPENCODE_FAIL:-0}" = "1" ]; then
  echo "PLAN-RUNNER-RESULT: failure fake"
else
  echo "PLAN-RUNNER-RESULT: success fake"
fi
