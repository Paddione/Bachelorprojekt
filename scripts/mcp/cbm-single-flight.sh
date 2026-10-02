#!/usr/bin/env bash
# scripts/mcp/cbm-single-flight.sh — Single-Flight-Wrapper fuer codebase-memory-mcp
#
# Serialisiert gleichzeitige Index-Laeufe per flock, um CPU/Disk-Stampedes auf der
# Entwicklerbox zu verhindern. Erfasst vor/nach dem Lauf einen Fingerprint und
# schreibt bei stabilem Erfolg einen atomaren Receipt (siehe Helper).
#
# Usage:
#   scripts/mcp/cbm-single-flight.sh '<json-args>'
#
# Beispiel:
#   scripts/mcp/cbm-single-flight.sh '{"repo_path": "/path/to/repo", "mode": "fast", "persistence": true}'
#
# Exit-Codes:
#   0: Indexierung erfolgreich
#   2: Ungueltige Argumente (genau ein JSON-String erforderlich)
#   3: Lock-Timeout (Default 3000s, via CBMSF_TIMEOUT konfigurierbar)
#   *: MCP CLI Exit-Code unveraendert

set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 '<json-args>'" >&2
  exit 2
fi

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HELPER="$HERE/cbm-freshness.py"
ARGS_JSON="$1"

LOCKDIR="$HOME/.cache/codebase-memory-mcp"
LOCKFILE="$HOME/.cache/codebase-memory-mcp/cbm-index.lock"

if ! mkdir -p "$LOCKDIR" 2>/dev/null; then
  echo "[cbm-single-flight] WARN: mkdir $LOCKDIR fehlgeschlagen, nutze Fallback-Lock" >&2
  LOCKFILE="/tmp/cbm-index-${USER:-unknown}.lock"
fi

TIMEOUT="${CBMSF_TIMEOUT:-3000}"

exec 9>"$LOCKFILE"

if ! flock -w "$TIMEOUT" 9; then
  echo "[cbm-single-flight] lock timeout after ${TIMEOUT}s waiting on $LOCKFILE" >&2
  exit 3
fi

if [ ! -f "$HELPER" ]; then
  echo "[cbm-single-flight] helper missing: $HELPER" >&2
  exit 1
fi

BEGIN_OUT=""
if ! BEGIN_OUT=$(python3 "$HELPER" begin --args-json "$ARGS_JSON" 2>/tmp/cbm-begin-$$.err); then
  BEGIN_RC=$?
  cat /tmp/cbm-begin-$$.err >&2 || true
  rm -f /tmp/cbm-begin-$$.err
  exit "$BEGIN_RC"
fi
rm -f /tmp/cbm-begin-$$.err

ATTEMPT_ID=$(printf '%s' "$BEGIN_OUT" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("attempt_id",""))' 2>/dev/null || true)
if [ -z "$ATTEMPT_ID" ]; then
  echo "[cbm-single-flight] begin returned no attempt_id" >&2
  exit 1
fi

OUT_FILE=$(mktemp /tmp/cbm-index-out-XXXXXX)
ERR_FILE=$(mktemp /tmp/cbm-index-err-XXXXXX)
cleanup() { rm -f "$OUT_FILE" "$ERR_FILE"; }
trap cleanup EXIT

set +e
codebase-memory-mcp cli index_repository "$ARGS_JSON" >"$OUT_FILE" 2>"$ERR_FILE"
CLI_EXIT=$?
set -e

cat "$OUT_FILE"
cat "$ERR_FILE" >&2

set +e
python3 "$HELPER" finish --args-json "$ARGS_JSON" --attempt-id "$ATTEMPT_ID" --exit-code "$CLI_EXIT" --stdout-file "$OUT_FILE" --stderr-file "$ERR_FILE"
FINISH_EXIT=$?
set -e

cleanup
trap - EXIT

if [ "$CLI_EXIT" -ne 0 ]; then
  exit "$CLI_EXIT"
fi
if [ "$FINISH_EXIT" -ne 0 ]; then
  exit "$FINISH_EXIT"
fi
exit 0
