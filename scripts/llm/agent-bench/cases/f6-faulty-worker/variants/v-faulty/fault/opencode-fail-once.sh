#!/usr/bin/env bash
# Fault-Injektor fuer faulty-worker: Der ERSTE Aufruf meldet failure (ohne
# etwas zu tun), alle weiteren delegieren an $FAULT_REAL.
# Aufruf wie opencode (Prompt = letztes Argument). Zustand: $FAULT_STATE.
set -u
state="${FAULT_STATE:?FAULT_STATE not set}"
real="${FAULT_REAL:?FAULT_REAL not set}"
if [ ! -f "$state" ]; then
  : > "$state"
  echo "working (faulty first attempt)"
  echo "PLAN-RUNNER-RESULT: failure injected fault: worker crashed on first attempt"
  exit 0
fi
exec "$real" "$@"
