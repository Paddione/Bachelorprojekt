#!/usr/bin/env bash
# devflow-verify.sh — enforce timeout and foreground-only execution for verification tasks.
# Wraps task commands to prevent background runs and enforce a max runtime. [T002448-M7]
set -euo pipefail

TIMEOUT="${DEVFLOW_VERIFY_TIMEOUT:-600}"   # default 10 min
COMMAND="${@:?Usage: devflow-verify.sh <command> [args...]}"

# Reject background execution (no terminal = background or pipe)
if [[ ! -t 0 ]]; then
  echo "devflow-verify: FEHLER — Verifikation darf nicht im Hintergrund laufen (stdin ist kein Terminal)." >&2
  echo "  Führe den Befehl direkt aus, nicht mit & oder in einer Pipe." >&2
  exit 3
fi

echo "devflow-verify: starte verification (timeout=${TIMEOUT}s): $COMMAND" >&2
timeout "$TIMEOUT" bash -c "$COMMAND"
RC=$?

case $RC in
  0)   echo "devflow-verify: verification OK" >&2 ;;
  124) echo "devflow-verify: TIMEOUT nach ${TIMEOUT}s — verification abgebrochen." >&2; exit 124 ;;
  *)   echo "devflow-verify: verification fehlgeschlagen (exit=$RC)" >&2; exit $RC ;;
esac
