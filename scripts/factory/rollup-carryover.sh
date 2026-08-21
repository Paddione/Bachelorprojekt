#!/usr/bin/env bash
# scripts/factory/rollup-carryover.sh — traegt unerledigte Mishap-Eintraege
# abgeschlossener Rollup-Zyklen in den naechsten Container [T013108].
#
# Warum: Ein Rollup-Container schliesst per Merge=Closure, sobald irgendein PR
# auf seinem Zyklus-Branch merged. Eintraege, die dabei unerledigt blieben,
# waren danach unrettbar — der naechste Flush legt einen frischen Container an,
# und die Batch-Kommentare des alten liest niemand mehr. Beobachtet am Zyklus
# 08-20/T012909 (PR #4884): 3 von 10 Eintraegen erledigt, Container done/fixed.
# T013043 hat Unerledigtes im Plan SICHTBAR gemacht; dieses Skript traegt es
# WEITER.
#
# Der erzeugte Uebertrag ist ein regulaerer Batch: sein Body beginnt mit dem
# Flusher-Header '### Mishap-Rollup' und traegt die Eintraege im Muster
# '**N. Titel** (typ, komponente)'. Er geht damit durch dieselbe Tuer wie ein
# frischer Flush und wird von rollup-plan-tasks.sh mitgezaehlt.
#
# Rueckwirkung gibt es nicht: Zyklen vor T013043 haben keine Eintrags-Checkboxen,
# liefern also keine Treffer. Der Carry-over greift ab dem ersten Zyklus, der
# mit der neuen Plan-Struktur erzeugt wurde.
#
# Usage: rollup-carryover.sh --plan <tasks.md> --slug <quell-slug>
#          gibt den Batch-Body auf stdout aus
#        rollup-carryover.sh --scan <repo-root> --container <aktuelle-id>
#          listet uebertragbare Zyklen als '<slug>\t<plan-pfad>' auf stdout
# Exit: 0 = Ausgabe erzeugt | 3 = nichts zu uebertragen | 2 = Aufruffehler
set -euo pipefail

usage() {
  sed -n 's/^# \(Usage:.*\)$/\1/p; s/^#        \(rollup-carryover.sh .*\)$/  \1/p' "$0"
}

MODE="" PLAN="" SLUG="" SCAN_ROOT="" CONTAINER=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --plan)      MODE="plan"; PLAN="$2"; shift 2 ;;
    --slug)      SLUG="$2"; shift 2 ;;
    --scan)      MODE="scan"; SCAN_ROOT="$2"; shift 2 ;;
    --container) CONTAINER="$2"; shift 2 ;;
    --help)      usage; exit 0 ;;
    *) echo "rollup-carryover: unbekanntes Argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

# Offene Eintrags-Tasks eines Zyklus-Plans. Nummerierte Boxen sind die
# Mishap-Eintraege; die Prozess-Schritte (RED-Step, Final Verification) tragen
# keine Nummer und fallen damit heraus.
_open_entries() {
  grep -E '^- \[ \] \*\*[0-9]+\. ' "$1" 2>/dev/null || true
}

# ── Modus: scan ─────────────────────────────────────────────────────────────
if [[ "$MODE" == "scan" ]]; then
  [[ -n "$SCAN_ROOT" && -n "$CONTAINER" ]] || {
    echo "rollup-carryover: --scan braucht --container" >&2; usage >&2; exit 2; }

  # Kandidaten sammeln, nach Zyklus-Datum sortiert.
  candidates=()
  while IFS= read -r plan; do
    [[ -f "$plan" ]] || continue
    dir="$(dirname "$plan")"
    # Der laufende Zyklus gehoert dem aktuellen Container und darf sich nicht
    # selbst uebertragen — sonst verdoppelt jeder Lauf seine eigenen Eintraege.
    if [[ -f "$dir/.ticket" ]] && [[ "$(tr -d '[:space:]' < "$dir/.ticket")" == "$CONTAINER" ]]; then
      continue
    fi
    [[ -n "$(_open_entries "$plan")" ]] || continue
    # Der Slug ist der Verzeichnisname; im Archiv traegt er zusaetzlich ein
    # Datumspraefix, das der Archivierer voranstellt. Sortiert wird nach dem
    # Zyklus-Datum IM Slug, nicht nach dem Pfad — sonst laegen archivierte und
    # offene Changes in getrennten Ordnungen.
    slug="$(basename "$dir")"
    cycle_date="$(printf '%s\n' "$slug" | sed -E 's/^.*mishap-incident-rollup-([0-9]{4}-[0-9]{2}-[0-9]{2}).*$/\1/')"
    candidates+=("${cycle_date}"$'\t'"${slug}"$'\t'"${plan}")
  done < <(find "$SCAN_ROOT/openspec/changes" -type f -name tasks.md -path '*mishap-incident-rollup-*' 2>/dev/null | sort)

  [[ "${#candidates[@]}" -gt 0 ]] || exit 3

  # NUR der juengste Zyklus wird uebertragen. Begruendung: sein Plan enthaelt
  # per Konstruktion bereits die Uebernahmen aller aelteren Zyklen — die wurden
  # in seinen Container getragen und dort mitgerendert. Wuerde der Scan alle
  # Kandidaten liefern, kaeme derselbe Eintrag nach zwei folgenlosen Zyklen
  # doppelt im naechsten Plan an.
  printf '%s\n' "${candidates[@]}" | sort | tail -1 | cut -f2,3
  exit 0
fi

# ── Modus: plan ─────────────────────────────────────────────────────────────
if [[ "$MODE" != "plan" ]]; then
  echo "rollup-carryover: --plan oder --scan ist Pflicht" >&2; usage >&2; exit 2
fi
[[ -n "$PLAN" && -n "$SLUG" ]] || {
  echo "rollup-carryover: --plan braucht --slug" >&2; usage >&2; exit 2; }
[[ -f "$PLAN" ]] || { echo "rollup-carryover: Plan nicht lesbar: $PLAN" >&2; exit 2; }

mapfile -t OPEN < <(_open_entries "$PLAN")
[[ "${#OPEN[@]}" -gt 0 ]] || exit 3

# Eintrags-Zeile → Titel und Meta. Die Dispositions-Anweisung hinter dem
# Gedankenstrich ist Vorlagentext des Vorlaufs und wandert nicht mit.
titles=() metas=()
for line in "${OPEN[@]}"; do
  titles+=("$(printf '%s\n' "$line" | sed -E 's/^- \[ \] \*\*[0-9]+\. (.*)\*\* \(([^)]*)\).*$/\1/')")
  metas+=("$(printf '%s\n' "$line"  | sed -E 's/^- \[ \] \*\*[0-9]+\. (.*)\*\* \(([^)]*)\).*$/\2/')")
done

# Body im Flusher-Format (scripts/ticket-mcp/go/internal/tools/mishap.go):
# Header, Tabelle, dann je Eintrag ein '**N. Titel** (meta)'-Block.
printf '### Mishap-Rollup — %d Eintraege (Carry-over aus %s)\n\n' "${#OPEN[@]}" "$SLUG"
printf 'Uebertrag aus dem abgeschlossenen Zyklus `%s`: diese Eintraege blieben dort ohne\n' "$SLUG"
printf 'Disposition. Sie werden hier weitergefuehrt, damit sie mit dem Container nicht\n'
printf 'stillschweigend verfallen.\n\n'
printf '| # | Typ | Komponente | Titel |\n|---|---|---|---|\n'
for i in "${!titles[@]}"; do
  typ="${metas[$i]%%,*}"
  komp="${metas[$i]#*, }"
  printf '| %d | %s | %s | %s |\n' "$((i + 1))" "$typ" "$komp" "${titles[$i]}"
done
printf '\n'
for i in "${!titles[@]}"; do
  printf '**%d. %s** (%s)\n\n' "$((i + 1))" "${titles[$i]}" "${metas[$i]}"
  printf 'Unerledigt aus `%s` uebernommen. Die urspruengliche Beschreibung steht im\n' "$SLUG"
  printf 'Batch-Kommentar jenes Zyklus und im dortigen Plan.\n'
done
