#!/usr/bin/env bash
# scripts/factory/rollup-archive-janitor.sh — archiviert abgeschlossene
# Rollup-Zyklen maschine-owned [T013305 Mechanismus D].
#
# Warum: Archivierung war session-owned Prosa ('devflow-post-merge-finalize'
# steht nur im dev-flow-execute-Skill; kein Tick, kein Workflow ruft es), weshalb
# die letzten vier abgeschlossenen Zyklen unarchiviert liegen. Der Janitor scannt
# wie der Carryover-Scan: Ticket done/archived + Change-Dir noch unarchiviert →
# move nach 'archive/<datum>-<slug>'.
#
# Der Scan ist NUR fuer maschinen-owned Zyklus-Dirs (mishap-incident-rollup-*)
# mit .ticket-Anker. Manuelle Changes werden nie angeruehrt; aktive Zyklen
# (Container nicht done/archived) bleiben stehen.
#
# Usage: rollup-archive-janitor.sh --scan <repo-root>
#          listet '<dir>\tarchive/<datum>-<slug>' auf stdout
#        rollup-archive-janitor.sh --apply <repo-root>
#          fuehrt die Moves aus (git mv, sonst mv) und listet sie
# Exit: 0 = Treffer | 3 = nichts zu tun | 2 = Aufruffehler
#
# Status-Quelle: SQL ueber factory_psql (lib.sh). Fuer Tests ueberschreibbar:
#   ROLLUP_JANITOR_STATUS_CMD=<pfad-zu-skript>  — wird als
#   'bash <skript> <external_id>' gerufen und gibt den Ticketstatus
#   (genau eine Zeile) auf stdout aus.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

usage() {
  sed -n 's/^# \(Usage:.*\)$/\1/p; s/^#          \(rollup-archive-janitor.sh .*\)$/ \1/p' "$0"
}

MODE="" ROOT=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --scan)  MODE="scan";  ROOT="$2"; shift 2 ;;
    --apply) MODE="apply"; ROOT="$2"; shift 2 ;;
    --help)  usage; exit 0 ;;
    *) echo "rollup-archive-janitor: unbekanntes Argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done
[[ -n "$ROOT" ]] || { echo "rollup-archive-janitor: --scan/--apply ist Pflicht" >&2; usage >&2; exit 2; }
[[ -d "$ROOT/openspec/changes" ]] || { echo "rollup-archive-janitor: kein changes-Baum: $ROOT" >&2; exit 2; }

_ticket_status() {
  local id="$1"
  if [[ -n "${ROLLUP_JANITOR_STATUS_CMD:-}" ]]; then
    bash "$ROLLUP_JANITOR_STATUS_CMD" "$id"
    return
  fi
  # Default: SQL ueber die gemeinsame Factory-DB-Verbindung.
  [[ -f "$HERE/lib.sh" ]] || { echo "janitor: lib.sh fehlt" >&2; return 1; }
  # shellcheck disable=SC1091
  source "$HERE/lib.sh"
  cat <<SQL | factory_psql
SELECT status FROM tickets.tickets WHERE external_id = '$id';
SQL
}

found=0
for dir in "$ROOT"/openspec/changes/*/; do
  slug="$(basename "$dir")"
  [[ "$slug" == mishap-incident-rollup-* ]] || continue
  [[ -f "$dir/.ticket" ]] || continue
  ticket="$(tr -d '[:space:]' < "$dir/.ticket")"
  [[ -n "$ticket" ]] || continue
  status="$(_ticket_status "$ticket" 2>/dev/null || true)"
  case "$status" in
    done|archived) : ;;
    *) continue ;;
  esac
  datum="$(printf '%s\n' "$slug" | sed -nE 's/^mishap-incident-rollup-([0-9]{4}-[0-9]{2}-[0-9]{2}).*$/\1/p')"
  [[ -n "$datum" ]] || { echo "janitor: WARNUNG — kein Datumspraefix in $slug, skip" >&2; continue; }
  target="archive/${datum}-${slug}"
  printf '%s\t%s\n' "${dir%/}" "$target"
  found=1
done

[[ "$found" -eq 1 ]] || exit 3

if [[ "$MODE" == "apply" ]]; then
  mkdir -p "$ROOT/openspec/changes/archive"
fi

if [[ "$MODE" != "apply" ]]; then
  exit 0
fi

# Moves ausfuehren: die Liste oben noch einmal durchlaufen.
for dir in "$ROOT"/openspec/changes/*/; do
  slug="$(basename "$dir")"
  [[ "$slug" == mishap-incident-rollup-* ]] || continue
  [[ -f "$dir/.ticket" ]] || continue
  ticket="$(tr -d '[:space:]' < "$dir/.ticket")"
  status="$(_ticket_status "$ticket" 2>/dev/null || true)"
  case "$status" in done|archived) : ;; *) continue ;; esac
  datum="$(printf '%s\n' "$slug" | sed -nE 's/^mishap-incident-rollup-([0-9]{4}-[0-9]{2}-[0-9]{2}).*$/\1/p')"
  [[ -n "$datum" ]] || continue
  dest="$ROOT/openspec/changes/archive/${datum}-${slug}"
  if git -C "$ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    git -C "$ROOT" mv "${dir%/}" "$dest"
  else
    mv "${dir%/}" "$dest"
  fi
done
exit 0
