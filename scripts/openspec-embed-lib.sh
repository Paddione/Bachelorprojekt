#!/usr/bin/env bash
# scripts/openspec-embed-lib.sh — pure, testable helpers for
# scripts/openspec-embed-local.sh and .githooks/post-commit-embed.
# Sourced only, never executed directly.

# pf_listener_pid <port> -> stdout: PID of the process listening on
# 127.0.0.1:<port> (empty if none/undetectable). Prefers `ss` (iproute2,
# present on the dev host and CI runners), falls back to `lsof`.
pf_listener_pid() {
  local port="$1"
  if command -v ss >/dev/null 2>&1; then
    ss -ltnp 2>/dev/null | grep ":${port} " | grep -oP 'pid=\K[0-9]+' | head -1
  elif command -v lsof >/dev/null 2>&1; then
    lsof -tiTCP:"${port}" -sTCP:LISTEN 2>/dev/null | head -1
  fi
}

# embed_output_is_success <output-text> -> exit 0 iff the text contains an
# "indexed slug='" marker AND does NOT also contain a completeness-gate
# WARN line. A parallel warning must fail the wrapper even though the
# embed itself nominally "succeeded" (T002870/T002877 escalation).
embed_output_is_success() {
  local out="$1"
  printf '%s' "$out" | grep -q "indexed slug='" || return 1
  printf '%s' "$out" | grep -q "WARN: completeness gate" && return 1
  return 0
}

# in_rebase -> exit 0 iff a rebase (merge or apply) is in progress in the
# current git worktree.
in_rebase() {
  [[ -d "$(git rev-parse --git-path rebase-merge 2>/dev/null)" ]] && return 0
  [[ -d "$(git rev-parse --git-path rebase-apply 2>/dev/null)" ]] && return 0
  return 1
}
