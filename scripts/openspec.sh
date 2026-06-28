#!/usr/bin/env bash
# scripts/openspec.sh — native OpenSpec-format verbs (propose/apply/archive/validate)
# backed by scripts/ticket.sh. Files conform to OpenSpec verbatim so `npm i -g openspec`
# is a drop-in switch. validate is FILESYSTEM-ONLY and fail-closed (CI gate).
#
#   scripts/openspec.sh propose <slug> --ticket <ext-id>
#   scripts/openspec.sh apply   <slug>
#   scripts/openspec.sh archive <slug>
#   scripts/openspec.sh validate
#
# OPENSPEC_ROOT overrides the openspec/ root (used by tests against fixtures).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/.." && pwd)"
OPENSPEC_ROOT="${OPENSPEC_ROOT:-$REPO/openspec}"
TICKET_SH="$REPO/scripts/ticket.sh"

die() { echo "ERROR: $*" >&2; exit 1; }

# Best-effort semantic index refresh for a change slug. Never aborts the lifecycle.
_embed_slug() {
  local slug="$1"
  node "$REPO/scripts/openspec-embed.mjs" --slug "$slug" >/dev/null 2>&1 || true
}

cmd_propose() {
  local slug="${1:-}"; shift || true
  local ticket=""
  while [[ $# -gt 0 ]]; do case "$1" in
    --ticket) ticket="$2"; shift 2 ;;
    *) die "Unknown propose option: $1" ;;
  esac; done
  [[ -n "$slug" ]]   || die "propose requires <slug>"
  [[ -n "$ticket" ]] || die "propose requires --ticket <ext-id>"
  local dir="$OPENSPEC_ROOT/changes/$slug"
  [[ -e "$dir" ]] && die "change '$slug' already exists at $dir"
  mkdir -p "$dir/specs"
  printf '# Proposal: %s\n\n## Why\n\n## What\n\n_Ticket: %s_\n' "$slug" "$ticket" > "$dir/proposal.md"
  # Seed a plan-lint-PASS tasks.md skeleton so the plan author only fills in
  # the body, not the frontmatter + section shape + verify-task gates. See
  # T001242 (Mishap 2). Quoted heredoc → no shell expansion inside the fences.
  cat > "$dir/tasks.md" <<OUTER_EOF
---
title: "$slug — Implementation Plan"
ticket_id: $ticket
domains: [plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# $slug — Implementation Plan

_Ticket: ${ticket}_

## File Structure

\`\`\`
<author fills this in — list of new/changed files>
\`\`\`

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Add the BATS test that reproduces the
      bug. The test must FAIL on the current branch. Use the phrase
      \`expected: FAIL\` in the step body so plan-lint STRUCT2 picks it up.

\`\`\`bash
# Example: run the BATS test the author will add in their first task
tests/unit/lib/bats-core/bin/bats tests/spec/$slug.bats
# expected: FAIL (red — the fix is not yet implemented)
\`\`\`

- [ ] **Fix-Step (GREEN).** Implement the fix. The BATS test from the
      previous step must now pass.

- [ ] **Final Verification.** Run the three mandatory CI gates:

\`\`\`bash
task test:changed
task freshness:regenerate
task freshness:check
\`\`\`
OUTER_EOF
  printf '## ADDED Requirements\n\n### Requirement: TODO\n\nThe system SHALL …\n\n#### Scenario: TODO\n\n- **GIVEN** …\n- **WHEN** …\n- **THEN** …\n' > "$dir/specs/$slug.md"
  echo "$ticket" > "$dir/.ticket"
  if [[ "${TICKET_OFFLINE:-0}" != "1" ]]; then
    bash "$TICKET_SH" update-status --id "$ticket" --status planning >/dev/null
  fi
  if [[ "${TICKET_OFFLINE:-0}" != "1" ]]; then
    bash "$HERE/openspec-status-map.sh" >/dev/null 2>&1 || true
  fi
  echo "proposed: $dir (ticket $ticket, status planning)"
}

cmd_apply() {
  local slug="${1:-}"
  [[ -n "$slug" ]] || die "apply requires <slug>"
  local dir="$OPENSPEC_ROOT/changes/$slug"
  [[ -d "$dir" ]] || die "no such change: $slug"
  [[ -f "$dir/tasks.md" ]] || die "change '$slug' has no tasks.md (not implementable)"
  if [[ "${TICKET_OFFLINE:-0}" != "1" && -f "$dir/.ticket" ]]; then
    bash "$TICKET_SH" update-status --id "$(cat "$dir/.ticket")" --status plan_staged >/dev/null
  fi
  if [[ "${TICKET_OFFLINE:-0}" != "1" ]]; then
    bash "$HERE/openspec-status-map.sh" >/dev/null 2>&1 || true
  fi
  _embed_slug "$slug"
  echo "applied: $slug (implementable)"
}

cmd_archive() {
  local slug="${1:-}"
  [[ -n "$slug" ]] || die "archive requires <slug>"
  local dir="$OPENSPEC_ROOT/changes/$slug"
  [[ -d "$dir" ]] || die "no such change: $slug"
  if [[ "${TICKET_OFFLINE:-0}" != "1" && -f "$dir/.ticket" ]]; then
    local st
    st="$(bash "$TICKET_SH" get --id "$(cat "$dir/.ticket")" 2>/dev/null | grep -o '"status" *: *"[^"]*"' | head -1 | grep -o '"[^"]*"$' | tr -d '"' || true)"
    [[ "$st" == "done" ]] || die "archive refused: ticket status is '${st:-unknown}', expected 'done'"
  fi
  local dest="$OPENSPEC_ROOT/changes/archive/$(date +%F)-$slug"
  if [[ -d "$dir/specs" ]]; then
    for capfile in "$dir/specs"/*.md; do
      [[ -e "$capfile" ]] || continue
      local cap; cap="$(basename "$capfile")"
      _merge_delta "$capfile" "$OPENSPEC_ROOT/specs/$cap"
    done
  fi
  mkdir -p "$(dirname "$dest")"
  mv "$dir" "$dest"
  if [[ "${TICKET_OFFLINE:-0}" != "1" ]]; then
    bash "$HERE/openspec-status-map.sh" >/dev/null 2>&1 || true
  fi
  # Refresh pgvector index via openspec-embed.mjs (best-effort, never aborts).
  _embed_slug "$slug"
  echo "archived: $slug -> $dest (delta merged into SSOT)"
}

_merge_delta() {
  local delta="$1" ssot="$2"
  # Operation-aware merge (ADDED/MODIFIED/REMOVED/RENAMED). Fail-closed: a missing
  # target, a RENAMED without **Renamed-to:**, or a skeleton stub exits non-zero
  # and aborts the archive (set -e) before the SSOT can be corrupted.
  node "$REPO/scripts/openspec-merge.mjs" apply "$delta" "$ssot"
}

cmd_validate() {
  local changes="$OPENSPEC_ROOT/changes"
  local rc=0
  [[ -d "$changes" ]] || { echo "no changes/ dir under $OPENSPEC_ROOT (ok)"; return 0; }
  shopt -s nullglob
  for dir in "$changes"/*/; do
    local base; base="$(basename "$dir")"
    [[ "$base" == "archive" ]] && continue
    if [[ ! -d "$dir/specs" ]]; then
      echo "FAIL: $base missing specs/ delta dir" >&2; rc=1; continue
    fi
    local had_cap=0
    for capfile in "$dir/specs"/*.md; do
      [[ -e "$capfile" ]] || continue
      had_cap=1
      _validate_delta_file "$capfile" || rc=1
    done
    [[ "$had_cap" -eq 1 ]] || { echo "FAIL: $base specs/ has no capability .md" >&2; rc=1; }
    [[ -f "$dir/.ticket" ]] || echo "WARN: $base has no .ticket link" >&2
  done
  shopt -u nullglob
  [[ "$rc" -eq 0 ]] && echo "openspec validate: OK"
  return "$rc"
}

_validate_delta_file() {
  local f="$1" rc=0
  grep -qE '^## (ADDED|MODIFIED|REMOVED|RENAMED) Requirements\s*$' "$f" \
    || { echo "FAIL: $f missing '## ADDED|MODIFIED|REMOVED|RENAMED Requirements' header" >&2; rc=1; }
  grep -qE '^### Requirement: ' "$f" \
    || { echo "FAIL: $f has no '### Requirement: ' (H3) entry" >&2; rc=1; }
  if grep -qE '^## Requirement: ' "$f"; then
    echo "FAIL: $f uses H2 '## Requirement:' (must be H3 '### Requirement:')" >&2; rc=1
  fi
  return "$rc"
}

main() {
  [[ $# -ge 1 ]] || { echo "Usage: $0 <propose|apply|archive|validate> [args]" >&2; exit 2; }
  local cmd="$1"; shift
  case "$cmd" in
    propose)  cmd_propose  "$@" ;;
    apply)    cmd_apply    "$@" ;;
    archive)  cmd_archive  "$@" ;;
    validate) cmd_validate "$@" ;;
    *) echo "Unknown verb: $cmd" >&2; echo "Usage: $0 <propose|apply|archive|validate>" >&2; exit 2 ;;
  esac
}
main "$@"
