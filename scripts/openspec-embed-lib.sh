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

# embed_output_is_success <output-text> [<slug>] -> exit 0 iff the text
# contains an "indexed slug='" marker AND does NOT also contain a
# completeness-gate WARN line. A parallel warning must fail the wrapper even
# though the embed itself nominally "succeeded" (T002870/T002877 escalation).
# With an optional <slug>: a WARN only negates the success when THAT slug is
# listed as missing — WARNs naming only foreign worktree plans (the observed
# T004598 case: 20/31 missing active plans from other worktrees) leave the
# success intact. Without <slug> the behaviour is unchanged (T004598).
embed_output_is_success() {
  local out="$1"
  local slug="${2:-}"
  printf '%s' "$out" | grep -q "indexed slug='" || return 1
  local warn
  warn="$(printf '%s' "$out" | grep -oP 'WARN: completeness gate.*' | head -1)"
  [[ -n "$warn" ]] || return 0
  # Ohne Slug: bisheriges Verhalten — jede WARN failt.
  [[ -z "$slug" ]] && return 1
  # Mit Slug: nur failen, wenn der Slug als exakter Eintrag in der
  # missing-Liste steht (literal Match — Metazeichen im Slug sind
  # wirkungslos; demo darf demo2 nicht matchen).
  local missing
  missing="$(printf '%s' "$warn" | grep -oP ':\s+\K[^:]*$' | head -1)"
  if [[ -z "$missing" ]] || ! printf '%s' "$missing" \
       | tr ',' '\n' | sed 's/^ *//; s/ *$//' \
       | grep -qxF "$slug"; then
    return 0
  fi
  return 1
}

# in_rebase -> exit 0 iff a rebase (merge or apply) is in progress in the
# current git worktree.
in_rebase() {
  [[ -d "$(git rev-parse --git-path rebase-merge 2>/dev/null)" ]] && return 0
  [[ -d "$(git rev-parse --git-path rebase-apply 2>/dev/null)" ]] && return 0
  return 1
}
# parse_pf_local_port <kubectl-forwarding-stdout> -> stdout: der von kubectl auf
# 127.0.0.1 zugewiesene lokale Port (leer, falls (noch) keine Forwarding-Zeile vorhanden).
parse_pf_local_port() {
  printf '%s' "$1" | grep -oP 'Forwarding from 127\.0\.0\.1:\K[0-9]+' | head -1
}
