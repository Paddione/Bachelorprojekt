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
