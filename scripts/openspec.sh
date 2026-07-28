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

# T001997: anchor REPO on the CALLER's cwd (git toplevel), not on the
# physical path this script file was invoked with. A wrong relative
# invocation path (e.g. `../../scripts/openspec.sh` from inside a worktree)
# used to resolve REPO to whatever directory the path landed in -- silently
# writing openspec/changes/<slug>/ into the wrong checkout even though $PWD
# was correct. Anchoring on `git rev-parse --show-toplevel` makes the
# invocation path irrelevant: as long as $PWD is the intended checkout,
# that's where REPO points.
REPO="$(git rev-parse --show-toplevel 2>/dev/null)" || { echo "ERROR: openspec.sh must be run from inside a git worktree (cwd is not a git repository)" >&2; exit 1; }
HERE="$REPO/scripts"
OPENSPEC_ROOT="${OPENSPEC_ROOT:-$REPO/openspec}"
TICKET_SH="$REPO/scripts/ticket.sh"

die() { echo "ERROR: $*" >&2; exit 1; }

# Best-effort semantic index refresh for a change slug. Never aborts the lifecycle.
_embed_slug() {
  local slug="$1"
  node "$REPO/scripts/openspec-embed.mjs" --slug "$slug" >/dev/null 2>&1 || true
}

# [T002375-p5] Platzhalter-Marker. EINE Liste, weil sie mit dem Seed-Code unten
# uebereinstimmen muss — zwei Listen laufen auseinander und der Resume-Pfad haelt dann
# eine Skelettdatei faelschlich fuer befuellt (oder umgekehrt).
_OPENSPEC_PLACEHOLDERS=(
  '<author fills this in'
  '### Requirement: TODO'
  '#### Scenario: TODO'
  'expected: FAIL (red — the fix is not yet implemented)'
)

# Ist die Datei leer, fehlend oder enthaelt sie AUSSCHLIESSLICH Geruest? Heuristik:
# eine Datei gilt als Skelett, wenn sie mindestens einen Marker traegt und ausser den
# geseedeten Ueberschriften/Markern keine Substanz hat.
_is_placeholder_file() {
  local f="$1"
  [[ -f "$f" ]] || return 0
  [[ -s "$f" ]] || return 0
  local m
  for m in "${_OPENSPEC_PLACEHOLDERS[@]}"; do
    grep -qF -- "$m" "$f" && return 0
  done
  # proposal.md hat keine Marker: leere Why/What-Abschnitte sind sein Skelett-Zustand.
  if [[ "$(basename "$f")" == "proposal.md" ]]; then
    local body
    body="$(sed -e '/^#/d' -e '/^_Ticket:/d' -e '/^[[:space:]]*$/d' "$f")"
    [[ -z "$body" ]] && return 0
  fi
  return 1
}

_propose_state_report() {
  local dir="$1" f rel
  echo "openspec propose: '$dir' existiert bereits — Zustand je Datei:"
  while IFS= read -r f; do
    rel="${f#"$dir"/}"
    if _is_placeholder_file "$f"; then
      printf '  [Skelett ] %s (%s Bytes)\n' "$rel" "$(wc -c < "$f" | tr -d ' ')"
    else
      printf '  [befuellt] %s (%s Bytes) — wird von --resume NICHT angetastet\n' \
        "$rel" "$(wc -c < "$f" | tr -d ' ')"
    fi
  done < <(find "$dir" -type f -name '*.md' | sort)
}

# Seedet nur, wenn die Datei fehlt oder reines Skelett ist. Ohne --resume ist der
# Aufruf der bisherige Weg (der Ordner existierte ja nicht). Kein --force: Ueberschreiben
# bestehender Substanz bleibt eine bewusste manuelle Handlung.
_seed_if_placeholder() {
  local f="$1" resume="$2" content="$3"
  if [[ "$resume" == "1" ]] && [[ -f "$f" ]] && ! _is_placeholder_file "$f"; then
    echo "  kept   $(basename "$f") (befuellt)" >&2
    return 0
  fi
  printf '%s\n' "$content" > "$f"
  [[ "$resume" == "1" ]] && echo "  seeded $(basename "$f")" >&2
  return 0
}

cmd_propose() {
  local slug="${1:-}"; shift || true
  local ticket=""
  local target_spec=""
  local resume=0
  while [[ $# -gt 0 ]]; do case "$1" in
    --ticket) ticket="$2"; shift 2 ;;
    --target-spec) target_spec="$2"; shift 2 ;;
    --resume) resume=1; shift ;;
    *) die "Unknown propose option: $1" ;;
  esac; done
  [[ -n "$slug" ]]   || die "propose requires <slug>"
  [[ -n "$ticket" ]] || die "propose requires --ticket <ext-id>"
  local dir="$OPENSPEC_ROOT/changes/$slug"
  if [[ -e "$dir" && "$resume" != "1" ]]; then
    # [T002375-p5] Vor dem Abbruch berichten, WAS im Ordner steht. Bis hierher brach
    # `propose` blind ab, sobald der Ordner existierte — unabhaengig davon, ob er
    # echten Inhalt oder nur das Skelett enthaelt. Im Ursprungsfall (T002356-M3) lag
    # ein gemischter Zustand vor: design.md mit Root-Cause und Live-Messung (8390
    # Bytes), proposal.md mit leeren Why/What, tasks.md das reine Skelett. Ohne diesen
    # Bericht muss man jede Datei von Hand inspizieren, um zu entscheiden, was
    # uebernommen werden darf — und ein blindes Ueberschreiben vernichtet genau die
    # Arbeit einer vorherigen Session.
    _propose_state_report "$dir" >&2
    die "change '$slug' already exists at $dir — mit --resume nur fehlende/leere Dateien seeden"
  fi
  mkdir -p "$dir/specs"
  _seed_if_placeholder "$dir/proposal.md" "$resume" \
    "$(printf '# Proposal: %s\n\n## Why\n\n## What\n\n_Ticket: %s_\n' "$slug" "$ticket")"
  # Seed a plan-lint-PASS tasks.md skeleton so the plan author only fills in
  # the body, not the frontmatter + section shape + verify-task gates. See
  # T001242 (Mishap 2). Quoted heredoc → no shell expansion inside the fences.
  local _tasks_skeleton
  _tasks_skeleton="$(cat <<OUTER_EOF
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
)"
  _seed_if_placeholder "$dir/tasks.md" "$resume" "$_tasks_skeleton"
  local delta_spec_name="${target_spec:-$slug}"
  _seed_if_placeholder "$dir/specs/$delta_spec_name.md" "$resume" \
    "$(printf '## ADDED Requirements\n\n### Requirement: TODO\n\nThe system SHALL …\n\n#### Scenario: TODO\n\n- **GIVEN** …\n- **WHEN** …\n- **THEN** …')"
  echo "$ticket" > "$dir/.ticket"
  if [[ "${TICKET_OFFLINE:-0}" != "1" ]]; then
    bash "$TICKET_SH" update-status --id "$ticket" --status planning >/dev/null
  fi
  if [[ "${TICKET_OFFLINE:-0}" != "1" ]]; then
    bash "$HERE/openspec-status-map.sh" >/dev/null 2>&1 || true
  fi
  if [[ "$resume" == "1" ]]; then
    echo "resumed: $dir (ticket $ticket) — befuellte Dateien blieben unangetastet"
  else
    echo "proposed: $dir (ticket $ticket, status planning)"
  fi
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
  local slug="${1:-}"; shift || true
  [[ -n "$slug" ]] || die "archive requires <slug>"
  local create_new=""
  local force_new=""
  while [[ $# -gt 0 ]]; do case "$1" in
    --create-new) create_new="--create-new"; shift ;;
    --force-new-component) force_new="--force-new-component"; shift ;;
    *) die "Unknown archive option: $1" ;;
  esac; done
  local dir="$OPENSPEC_ROOT/changes/$slug"
  [[ -d "$dir" ]] || die "no such change: $slug"
  if [[ "${TICKET_OFFLINE:-0}" != "1" && -f "$dir/.ticket" ]]; then
    local st
    st="$(bash "$TICKET_SH" get --id "$(cat "$dir/.ticket")" 2>/dev/null | grep -o '"status" *: *"[^"]*"' | head -1 | grep -o '"[^"]*"$' | tr -d '"' || true)"
    [[ "$st" == "done" ]] || die "archive refused: ticket status is '${st:-unknown}', expected 'done'"
  fi
  local dest="$OPENSPEC_ROOT/changes/archive/$(date +%F)-$slug"
  # [T002428] VOR dem Delta-Merge pruefen, nicht danach: `mv "$dir" "$dest"` weiter unten
  # verschiebt die Quelle in ein bestehendes Ziel HINEIN (archive/<datum>-<slug>/<slug>/)
  # statt es zu ersetzen — ohne Fehler und ohne Hinweis. Wuerde erst danach abgebrochen,
  # waere das Delta bereits in der SSOT und der Lauf nicht mehr wiederholbar.
  if [[ -e "$dest" ]]; then
    die "archive refused: Archivziel existiert bereits: $dest
  Ein erneuter Lauf wuerde '$slug' dort hinein verschachteln statt zu ersetzen.
  Pruefe, ob der Change schon (teilweise) archiviert ist:
    bash scripts/openspec-half-archive-check.sh"
  fi
  if [[ -d "$dir/specs" ]]; then
    for capfile in "$dir/specs"/*.md; do
      [[ -e "$capfile" ]] || continue
      local cap; cap="$(basename "$capfile")"
      _merge_delta "$capfile" "$OPENSPEC_ROOT/specs/$cap" "$create_new" "$force_new"
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
  local delta="$1" ssot="$2" create_new="${3:-}" force_new="${4:-}"
  # Operation-aware merge (ADDED/MODIFIED/REMOVED/RENAMED). Fail-closed: a missing
  # target, a RENAMED without **Renamed-to:**, or a skeleton stub exits non-zero
  # and aborts the archive (set -e) before the SSOT can be corrupted.
  node "$REPO/scripts/openspec-merge.mjs" apply "$delta" "$ssot" $create_new $force_new
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
