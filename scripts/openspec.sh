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
TICKET_SH="${TICKET_SH:-$REPO/scripts/ticket.sh}"

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
  # ── --help (vor allen Guards, T002908) ──────────────────────────────────
  if [[ "${1:-}" == "--help" ]]; then
    cat <<'HELP'
Usage: scripts/openspec.sh propose <slug> --ticket <ext-id>
  <slug>          change slug, e.g. my-feature
  --ticket        external ticket id, e.g. T000123 (Pflicht)
  --target-spec   delta spec name (default: <slug>)
  --resume        nur fehlende/leere Dateien seeden, befuellte unangetastet

OPENSPEC_ROOT   openspec/ root ueberschreiben (Tests gegen Fixtures)
HELP
    return 0
  fi
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
  # [T002381-M2] Ticket-Status-Uebergang VOR dem Scaffold, damit ein Fehlschlag
  # (z.B. agent-lock-Guard in ticket.sh) keine orphan-Dateien hinterlaesst.
  if [[ "${TICKET_OFFLINE:-0}" != "1" ]]; then
    bash "$TICKET_SH" update-status --id "$ticket" --status planning >/dev/null
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
  local no_merge=0
  while [[ $# -gt 0 ]]; do case "$1" in
    --create-new) create_new="--create-new"; shift ;;
    --force-new-component) force_new="--force-new-component"; shift ;;
    --no-merge) no_merge=1; shift ;;
    *) die "Unknown archive option: $1" ;;
  esac; done
  local dir="$OPENSPEC_ROOT/changes/$slug"
  [[ -d "$dir" ]] || die "no such change: $slug"
  if [[ "${TICKET_OFFLINE:-0}" != "1" && -f "$dir/.ticket" ]]; then
    local st ticket_json
    ticket_json="$(bash "$TICKET_SH" get --id "$(cat "$dir/.ticket")" 2>/dev/null)" || true
    st="$(printf '%s' "$ticket_json" | grep -o '"status" *: *"[^"]*"' | head -1 | grep -o '"[^"]*"$' | tr -d '"' || true)"
    # [T002569] 'archived' ist ein SPAETERER Lifecycle-Zustand als 'done' (das
    # Ticket wurde bereits abgeschlossen und danach ins Archiv verschoben), kein
    # frueherer -- die Erweiterung ist keine Aufweichung des Fail-closed-Guards.
    # Ein leerer oder unbekannter Status faellt weiterhin durch, da er keinem der
    # beiden terminalen Werte entspricht.
    [[ "$st" == "done" || "$st" == "archived" ]] || die "archive refused: ticket status is '${st:-unknown}', expected 'done' or 'archived'"
    # [T002813] Deliverable-presence guard: cross-checks the ticket's declared
    # touched_files against the working tree. Graded: advisory on empty/null data,
    # hard refusal only when ALL declared files are absent (the #3919/#3914 shape
    # where the archive PR landed before the fix PR carrying the deliverable).
    _check_deliverable_presence "$ticket_json" "$slug"
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
  # [T002581] Zwei-Pass: erst ALLE Deltas pruefen, dann ALLE anwenden. Vorher lief
  # der Merge pro Datei in einer Schleife — brach Datei 2 an einem Guard ab, war die
  # SSOT von Datei 1 bereits mutiert, das Change-Verzeichnis aber unverschoben. Ein
  # solcher Lauf war weder vollzogen noch folgenlos und nur von Hand zu reparieren.
  # Der Vorab-Check ist vollstaendig, nicht heuristisch: die Delta-Dateinamen in
  # changes/<slug>/specs/ sind eindeutig, jedes Delta zielt also auf eine eigene SSOT.
  # Kein Pass kann das Ergebnis eines anderen im selben Lauf beeinflussen.
  # [T002577] --no-merge: kein Delta wird in die SSOT gemergt, also laufen auch die
  # Stub-/Target-Guards nicht — es findet kein Schreibvorgang statt, gegen den sie
  # schuetzen muessten. Der Pfad ist fuer Prozess-Notizen (mishap-*-Bundles) gedacht,
  # deren Skeleton-Delta nie ausgefuellt wurde. Ohne --no-merge bleibt das
  # fail-closed Verhalten unveraendert.
  if [[ "$no_merge" -ne 1 && -d "$dir/specs" ]]; then
    for capfile in "$dir/specs"/*.md; do
      [[ -e "$capfile" ]] || continue
      local cap; cap="$(basename "$capfile")"
      _check_delta "$capfile" "$OPENSPEC_ROOT/specs/$cap" "$create_new" "$force_new"
    done
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
    # [T003136] Status-Map-Ergebnis sofort stagen. cmd_archive regeneriert
    # openspec-status.json zwar nach dem Move, aber der Archiv-Commit des
    # Aufrufers (opencode-flow-execute Step 7 / plan-archive-steps.md) staged
    # bisher nur die openspec/changes/-Verschiebung — die JSON blieb unstaged
    # und der Freshness-Gate meldete sie danach als stale (PR #4083). Das
    # Staging hier macht das Ergebnis unabhaengig vom pre-commit-Hook
    # (SKIP_FRESHNESS_REGEN, --no-verify) und vom Flow-Skill. Best-effort wie
    # der Status-Map-Aufruf selbst.
    git -C "$REPO" add -- "$REPO/website/src/data/openspec-status.json" >/dev/null 2>&1 || true
  fi
  # Refresh pgvector index via openspec-embed.mjs (best-effort, never aborts).
  _embed_slug "$slug"
  if [[ "$no_merge" -eq 1 ]]; then
    echo "archived: $slug -> $dest (no delta merged into SSOT)"
  else
    echo "archived: $slug -> $dest (delta merged into SSOT)"
  fi
}

# [T002813] Cross-checks the ticket's touched_files (from ticket.sh JSON, already
# captured in cmd_archive) against the actual working tree. Graded:
#   - empty/null → advisory, return 0 (no data to check against)
#   - all present  → return 0, silent
#   - partial match → warning with missing paths, return 0
#   - none present  → hard refusal (the #3919/#3914 shape: archive PR landed
#     before the fix PR carrying the deliverable)
_check_deliverable_presence() {
  local ticket_json="$1" slug="$2"
  local touched raw paths total present path
  touched="$(printf '%s' "$ticket_json" | grep -o '"touched_files" *: *\[[^]]*\]' | grep -o '\[[^]]*\]' || true)"
  if [ -z "$touched" ]; then
    echo "WARN: archive $slug: ticket hat kein touched_files — Deliverable-Praesenz nicht maschinell pruefbar (siehe CLAUDE.md M10)." >&2
    return 0
  fi
  paths=()
  while IFS= read -r raw; do
    raw="${raw//\"/}"
    [ "$raw" = "touched_files" ] && continue
    [ -z "$raw" ] && continue
    paths+=("$raw")
  done < <(printf '%s' "$touched" | grep -oE '"[^"]*"')
  total="${#paths[@]}"
  present=0
  local missing=()
  for path in "${paths[@]}"; do
    if [[ -e "$REPO/$path" ]]; then
      present=$((present + 1))
    else
      missing+=("$path")
    fi
  done
  if [ "$total" -gt 0 ] && [ "$present" -eq 0 ]; then
    die "archive refused: keines der deklarierten touched_files des Tickets liegt im Arbeitsbaum — Deliverable fehlt (T002813).
  touched_files: ${paths[*]}
  Der Archive-PR duerfte vor dem Fix-PR gelandet sein, der das Deliverable trug
  (siehe CLAUDE.md M10)."
  fi
  if [ "$total" -gt 0 ] && [ "$present" -lt "$total" ]; then
    echo "WARN: archive $slug: nur ${present}/${total} deklarierte touched_files liegen im Arbeitsbaum vor — pruefen, ob Umbenennungen/Loeschungen beabsichtigt sind. Fehlend: ${missing[*]}" >&2
  fi
  return 0
}

_merge_delta() {
  local delta="$1" ssot="$2" create_new="${3:-}" force_new="${4:-}"
  # Operation-aware merge (ADDED/MODIFIED/REMOVED/RENAMED). Fail-closed: a missing
  # target, a RENAMED without **Renamed-to:**, or a skeleton stub exits non-zero
  # and aborts the archive (set -e) before the SSOT can be corrupted.
  node "$REPO/scripts/openspec-merge.mjs" apply "$delta" "$ssot" $create_new $force_new
}

_check_delta() {
  local delta="$1" ssot="$2" create_new="${3:-}" force_new="${4:-}"
  # Trockenlauf mit denselben Guards wie _merge_delta, ohne jeden Schreibvorgang.
  # Fail-closed via set -e: bricht hier etwas ab, hat noch keine SSOT sich geaendert.
  node "$REPO/scripts/openspec-merge.mjs" check "$delta" "$ssot" $create_new $force_new
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
    # [T003676] fail-closed statt WARN — gleichgezogen mit dem TS-Validator
    # (scripts/openspec-validate.ts) und dem BATS-Guard ticket-file-required.bats.
    # Die Ausnahmeliste ist dieselbe Datei, damit die drei Pruefstellen nicht
    # auseinanderlaufen koennen.
    if ! _ticket_exempt_slug "$base"; then
      if [[ ! -f "$dir/.ticket" ]]; then
        echo "FAIL: $base has no .ticket link" >&2; rc=1
      elif [[ -z "$(tr -d '[:space:]' < "$dir/.ticket")" ]]; then
        # Nicht `[ -s ]`: eine Datei mit nur Whitespace ist nicht leer im Sinne von
        # -s (Groesse > 0), enthaelt aber keinen Ticket-Link. Der TS-Validator prueft
        # mit .trim() — beide muessen dieselbe Grenze ziehen, sonst laesst der eine
        # Pfad durch, was der andere ablehnt.
        echo "FAIL: $base has an empty .ticket" >&2; rc=1
      fi
    fi
  done
  shopt -u nullglob
  [[ "$rc" -eq 0 ]] && echo "openspec validate: OK"
  return "$rc"
}

# [T003676] Slugs ohne .ticket-Pflicht. Liest dieselbe Datei wie der TS-Validator
# und der BATS-Guard — die Liste wird bewusst nirgends dupliziert, sonst koennten
# die drei Pruefstellen denselben Change verschieden beurteilen. Fehlt die Datei,
# bleibt nur der Sonderfall: die Regel wird strenger, nicht laxer (fail-closed).
_ticket_exempt_slug() {
  local slug="$1"
  [[ "$slug" == "openspec-ticket-links-evaluation" ]] && return 0
  local backlog="$HERE/../tests/spec/openspec-workflow/t002573-backlog-slugs.txt"
  [[ -f "$backlog" ]] || return 1
  grep -qxF "$slug" "$backlog"
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

# archive-Optionen:
#   --create-new            Delta zielt auf eine neue SSOT-Komponente
#   --force-new-component   --create-new auch fuer Ticket-/Gate-Slugs erlauben
#   --no-merge              Change ins Archiv verschieben OHNE Delta-Merge in die
#                           SSOT (fuer Prozess-Notizen wie mishap-*-Bundles, deren
#                           Skeleton-Delta nie ausgefuellt wurde). Ohne dieses Flag
#                           greift der fail-closed Stub-/Target-Guard weiterhin.
main "$@"
