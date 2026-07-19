#!/usr/bin/env bash
# scripts/prod-write-guard.sh — Block DDL/DML writes against production namespaces.
# [T001954] Subagenten dürfen während Plan-/Diagnose-Phasen nicht gegen Prod schreiben.
#
# Usage:
#   prod-write-guard.sh check <namespace> <sql-statement> [--confirm-prod-write]
#   prod-write-guard.sh wrap  <namespace> <kubectl-exec-args...>
#
# Exit codes:
#   0 = operation allowed (read-only or override confirmed)
#   1 = operation blocked (write against production namespace)
#
# Env vars:
#   PROD_WRITE_GUARD_DENYLIST  — comma-separated namespaces (default: mentolder,workspace-korczewski)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

DENYLIST="${PROD_WRITE_GUARD_DENYLIST:-mentolder,workspace-korczewski}"

# DDL/DML keywords that indicate a write operation
WRITE_KEYWORDS='^\s*(CREATE|INSERT|UPDATE|DELETE|ALTER|DROP|TRUNCATE|REPLACE|MERGE)\b'

usage() {
  echo "Usage: prod-write-guard.sh {check|wrap} <namespace> <args...>" >&2
  echo "  check <namespace> <sql>   — check if SQL against namespace is allowed" >&2
  echo "  wrap  <namespace> <cmd>   — wrap a command, blocking if namespace is prod + write" >&2
  exit 2
}

is_denylisted() {
  local ns="$1"
  IFS=',' read -ra LIST <<< "$DENYLIST"
  for denied in "${LIST[@]}"; do
    [[ "$ns" == "$denied" ]] && return 0
  done
  return 1
}

contains_write() {
  local sql="$1"
  echo "$sql" | grep -qiE "$WRITE_KEYWORDS"
}

emit_blocked() {
  local ns="$1" op="$2" caller="${3:-unknown}"
  echo "GUARD: prod-write-blocked namespace=$ns op=$op caller=$caller" >&2
}

cmd_check() {
  local ns="${1:-}" sql="${2:-}" override="${3:-}"

  if [[ -z "$ns" ]]; then
    echo "check requires <namespace> and <sql>" >&2
    exit 2
  fi

  if [[ -z "$sql" ]]; then
    echo "GUARD: prod-write-allowed namespace=$ns op=empty-sql" >&2
    return 0
  fi

  if ! is_denylisted "$ns"; then
    echo "GUARD: prod-write-allowed namespace=$ns (not in denylist)" >&2
    return 0
  fi

  if ! contains_write "$sql"; then
    echo "GUARD: prod-write-allowed namespace=$ns op=read-only" >&2
    return 0
  fi

  if [[ "$override" == "--confirm-prod-write" ]]; then
    echo "GUARD: prod-write-override namespace=$ns caller=operator-confirm" >&2
    return 0
  fi

  emit_blocked "$ns" "ddl/dml" "prod-write-guard"
  return 1
}

cmd_wrap() {
  local ns="${1:-}"; shift || true

  if [[ -z "$ns" ]]; then
    echo "wrap requires <namespace>" >&2
    exit 2
  fi

  # Check if remaining args contain write keywords
  local all_args="$*"
  if is_denylisted "$ns" && contains_write "$all_args"; then
    # Check for override in args
    if [[ "$all_args" == *"--confirm-prod-write"* ]]; then
      echo "GUARD: prod-write-override namespace=$ns caller=explicit-flag" >&2
      exec "$@"
    fi
    emit_blocked "$ns" "ddl/dml" "prod-write-guard"
    return 1
  fi

  exec "$@"
}

# Main
[[ $# -lt 1 ]] && usage

SUBCMD="$1"; shift
case "$SUBCMD" in
  check) cmd_check "$@" ;;
  wrap)  cmd_wrap "$@" ;;
  *)     usage ;;
esac
