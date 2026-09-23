#!/usr/bin/env bash
# scripts/lib/archive-staged-scope.sh — Staged-Set-Pflicht fuer den Archiv-Commit. [T016597]
#
# WARUM: devflow-post-merge-finalize.sh stagte den Archiv-Commit mit
#   git add openspec/changes/ openspec/changes/archive/ openspec/specs/ ...
# also ueber den GESAMTEN Change-Baum. `git add <verzeichnis>` nimmt auch
# untracked Dateien mit — und damit die unfertige Arbeit jeder parallel
# laufenden Session.
#
# Belegt am 2026-08-28 (Abschluss von T016592, Archiv-PR #5288): das Staged-Set
# enthielt den noch untracked'en Fremd-Change openspec/changes/add-penpot-service
# einer anderen Session sowie ~4200 inhaltlich leere CRLF-Zeilen des
# archive-Baums. Der Commit musste von Hand neu aufgebaut werden.
#
# Das Muster ist dasselbe wie die Staged-Set-Pflicht in plan-preflight.sh
# (T005114): nicht darauf vertrauen, dass die add-Aufrufe genau treffen,
# sondern das Ergebnis pruefen und fail-closed abbrechen.
#
# Nutzung:
#   . scripts/lib/archive-staged-scope.sh
#   archive_assert_staged_scope "$SLUG"   # rc=0 sauber, rc=1 Fremdpfad im Index

# Erlaubt sind ausschliesslich:
#   openspec/changes/archive/<datum>-<slug>/…   das Archivziel
#   openspec/changes/<slug>/…                   die Quelle (als Loeschung)
#   openspec/specs/…                            die Ziele des Delta-Merge
#   components/website/src/data/openspec-status.json
#   die uebrigen Freshness-Artefakte, die task freshness:regenerate anfasst
archive_staged_scope_allowed() {
  local slug="$1" path="$2"
  case "$path" in
    openspec/changes/archive/*-"$slug"/*) return 0 ;;
    openspec/changes/"$slug"/*)           return 0 ;;
    openspec/specs/*)                     return 0 ;;
    components/website/src/data/*)        return 0 ;;
    components/website/src/lib/*)         return 0 ;;
    components/website/public/learning-assets/*) return 0 ;;
    docs/*)                               return 0 ;;
  esac
  return 1
}

archive_assert_staged_scope() {
  local slug="${1:-}"
  if [[ -z "$slug" ]]; then
    echo "archive-staged-scope: kein Slug uebergeben (fail-closed)" >&2
    return 1
  fi

  local foreign=() path
  while IFS= read -r path; do
    [[ -z "$path" ]] && continue
    archive_staged_scope_allowed "$slug" "$path" || foreign+=("$path")
  done < <(git diff --cached --name-only)

  if (( ${#foreign[@]} > 0 )); then
    echo "archive-staged-scope: FATAL — Pfade im Index, die nicht zum Change '$slug' gehoeren:" >&2
    printf '  %s\n' "${foreign[@]}" >&2
    echo "  Vermutlich hat ein breites 'git add' fremde oder unfertige Arbeit mitgenommen." >&2
    echo "  Abhilfe: 'git restore --staged <pfad>' und nur die Archiv-Pfade stagen." >&2
    return 1
  fi
  return 0
}

# Stage only the archived change and already-tracked generated artifacts. Keeping
# this operation here prevents both finalize paths from drifting back to a broad
# `git add openspec/changes/`, which can capture another session's work.
#
# [T900339] `git add -u` only stages *tracked* files. A SSOT spec created by
# `openspec.sh archive --create-new` is *untracked* and silently skipped. This
# function now explicitly stages each SSOT target that the archived deltas point
# to, so new specs reach the archive commit. A broad `git add -A openspec/specs`
# is avoided to preserve the staged-set discipline from T016597.
archive_stage_commit() {
  local slug="$1"; shift
  local no_merge=false
  local arg
  for arg in "$@"; do
    [[ "$arg" == "--no-merge" ]] && no_merge=true
  done

  # Existing staging: archived change dirs (-A) and tracked generated artifacts (-u).
  git add -A -- openspec/changes/archive/*-"$slug" "openspec/changes/$slug" 2>/dev/null || true
  git add -u -- openspec/specs components/website/src/data components/website/src/lib \
    components/website/public/learning-assets docs

  # [T900339 D1] Targeted staging of SSOT specs from delta filenames (only with merge).
  if ! $no_merge; then
    local delta_spec target missing=()
    for delta_spec in openspec/changes/archive/*-"$slug"/specs/*.md; do
      [[ -e "$delta_spec" ]] || continue
      target="openspec/specs/$(basename "$delta_spec")"
      [[ -e "$target" ]] && git add -- "$target"
    done

    # [T900339 D2] Verify every target spec is in the index (fail-closed).
    for delta_spec in openspec/changes/archive/*-"$slug"/specs/*.md; do
      [[ -e "$delta_spec" ]] || continue
      target="openspec/specs/$(basename "$delta_spec")"
      if ! git ls-files --error-unmatch -- "$target" >/dev/null 2>&1; then
        missing+=("$target")
      fi
    done
    if (( ${#missing[@]} > 0 )); then
      printf 'archive-stage: FATAL — Ziel-Spec fehlt im Index: %s\n' "${missing[@]}" >&2
      return 1
    fi
  fi

  archive_assert_staged_scope "$slug"
}
