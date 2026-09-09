#!/usr/bin/env bash
# scripts/render-guard.sh — fail-closed guard for TLS/routing placeholders.
#
# T900029 (SA-SEC-01, second half): the PROD Certificate `workspace/
# sessions-wildcard` once rendered as `dnsNames: ["*."]` because
# ${SESSIONS_DOMAIN} substituted to the empty string, and Let's Encrypt
# rejected it (`rejectedIdentifier`). A generic "leftover ${VAR}" check can
# not catch this class: the substitution DID happen, it just produced an
# empty wildcard remainder. This guard fails the render (non-zero exit)
# when a rendered manifest contains:
#   1. an empty wildcard remainder in quotes (`"*."` / `'*.'` — dnsNames,
#      tls.hosts, host lines), or
#   2. an unsubstituted ${VAR} placeholder inside a `dnsNames:` block, or
#   3. an empty or trailing-dot host inside `Host()` / `HostRegexp()`
#      matches (`` `*` ``, `` `id.` ``, `` `\.$` ``) or a leftover ${VAR}
#      on those lines.
#
# Scope is deliberately narrow: T002174 documents dozens of legitimately
# empty ${VAR} references (ConfigMap scripts, Grafana templates,
# SealedSecret-sourced values), so only dnsNames/Host lines are checked.
# Manifests without sessions content (e.g. the korczewski overlay, which
# has no sessions Certificate) pass untouched — no false positives.
#
# Usage:
#   scripts/render-guard.sh <file> [...]   # check files, exit 1 on hit
#   ... | scripts/render-guard.sh --stdin  # filter mode: check stdin,
#                                          # pass it through on success
# Exit: 0 = clean, 1 = violation found, 2 = usage error.
set -euo pipefail

MODE="files"
if [[ "${1:-}" == "--stdin" ]]; then
  MODE="stdin"
  shift
fi

if [[ "$MODE" == "files" && $# -eq 0 ]]; then
  echo "Usage: $0 [--stdin] <rendered-manifest> [...]" >&2
  exit 2
fi

check_file() {
  local file="$1"
  local failed=0
  local hits=""

  if [[ ! -f "$file" ]]; then
    echo "render-guard: FAIL: file not found: $file" >&2
    return 1
  fi

  # 1. Empty wildcard remainder in quotes — the T900029 defect shape.
  if hits="$(grep -nE '["'\'']\*\.["'\'']' "$file" || true)"; then
    if [[ -n "$hits" ]]; then
      echo "render-guard: FAIL: $file: empty wildcard remainder (\"*.\"):" >&2
      echo "$hits" >&2
      failed=1
    fi
  fi

  # 2. Leftover ${VAR} placeholders inside dnsNames: blocks.
  if hits="$(grep -A5 -E '^[[:space:]]*dnsNames:' "$file" 2>/dev/null \
      | grep -nE '\$\{[A-Za-z_][A-Za-z0-9_]*\}' || true)"; then
    if [[ -n "$hits" ]]; then
      echo "render-guard: FAIL: $file: unsubstituted placeholder in dnsNames block:" >&2
      echo "$hits" >&2
      failed=1
    fi
  fi

  # 3. Host()/HostRegexp() matches: leftover ${VAR}, empty or
  # trailing-dot host (empty-substituted domain remainder).
  local host_lines=""
  host_lines="$(grep -E 'Host\(|HostRegexp' "$file" || true)"
  if [[ -n "$host_lines" ]]; then
    if hits="$(grep -E '\$\{[A-Za-z_][A-Za-z0-9_]*\}' <<<"$host_lines" || true)"; then
      if [[ -n "$hits" ]]; then
        echo "render-guard: FAIL: $file: unsubstituted placeholder in Host match:" >&2
        echo "$hits" >&2
        failed=1
      fi
    fi
    if hits="$(grep -E '`\*`|`[^`]*\.`' <<<"$host_lines" || true)"; then
      if [[ -n "$hits" ]]; then
        echo "render-guard: FAIL: $file: empty/trailing-dot host in Host match:" >&2
        echo "$hits" >&2
        failed=1
      fi
    fi
    if hits="$(grep -F '\.$`' <<<"$host_lines" || true)"; then
      if [[ -n "$hits" ]]; then
        echo "render-guard: FAIL: $file: empty domain remainder in HostRegexp match:" >&2
        echo "$hits" >&2
        failed=1
      fi
    fi
  fi

  return "$failed"
}

if [[ "$MODE" == "stdin" ]]; then
  tmp="$(mktemp)"
  trap 'rm -f "$tmp"' EXIT
  cat > "$tmp"
  if ! check_file "$tmp"; then
    exit 1
  fi
  cat "$tmp"
  exit 0
fi

overall=0
for f in "$@"; do
  check_file "$f" || overall=1
done
exit "$overall"
