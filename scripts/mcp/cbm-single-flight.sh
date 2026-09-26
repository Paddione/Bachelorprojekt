#!/usr/bin/env bash
# scripts/mcp/cbm-single-flight.sh — Single-Flight-Wrapper fuer codebase-memory-mcp
#
# Serialisiert gleichzeitige Index-Laeufe per flock, um CPU/Disk-Stampedes auf der
# Entwicklerbox zu verhindern.
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

exec codebase-memory-mcp cli index_repository "$@"
