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
#          [--exclude-plan <tasks.md>]... [--exclude-file <f>]
#          gibt den Batch-Body auf stdout aus; Eintraege aus Exclude-Praenken
#          und Titel in der Exclude-Datei (eine pro Zeile) sind ausgeschieden
#          [T013305 — eskalierte Eintraege; --exclude-plan: T013330]
#        rollup-carryover.sh --scan <repo-root> --container <aktuelle-id>
#          listet uebertragbare Zyklen als '<slug>\t<plan-pfad>' auf stdout
#        rollup-carryover.sh --escalations <repo-root> --container <aktuelle-id>
#          Eintraege offen in >=2 abgeschlossenen Zyklen als
#          '<title>\t<meta>\t<slug1,slug2>' [T013305 Mechanismus C]
#        rollup-carryover.sh --watchlist-live <root> --today <JJJJ-MM-TT>
#          [--exclude-file <f>]  lebende 'beobachten'-Eintraege als Batch-Body
#          zur Injektion in den Generatorlauf [T013305 Mechanismus B]
#        rollup-carryover.sh --watchlist-expired <root> --today <JJJJ-MM-TT>
#          abgelaufene Beobachtungen als '<title>\t<meta>\t<faellig>\t<slug>'
# Exit: 0 = Ausgabe erzeugt | 3 = nichts zu uebertragen | 2 = Aufruffehler
set -euo pipefail

usage() {
  sed -n 's/^# \(Usage:.*\)$/\1/p; s/^#        \(rollup-carryover.sh .*\)$/  \1/p' "$0"
}

MODE="" PLAN="" SLUG="" SCAN_ROOT="" CONTAINER="" TODAY="" EXCLUDE_FILE=""
EXCLUDE_PLANS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --plan)          MODE="plan"; PLAN="$2"; shift 2 ;;
    --slug)          SLUG="$2"; shift 2 ;;
    --scan)          MODE="scan"; SCAN_ROOT="$2"; shift 2 ;;
    --escalations)   MODE="escalations"; SCAN_ROOT="$2"; shift 2 ;;
    --watchlist-live) MODE="wl_live"; SCAN_ROOT="$2"; shift 2 ;;
    --watchlist-expired) MODE="wl_expired"; SCAN_ROOT="$2"; shift 2 ;;
    --container)     CONTAINER="$2"; shift 2 ;;
    --today)         TODAY="$2"; shift 2 ;;
    --exclude-file)  EXCLUDE_FILE="$2"; shift 2 ;;
    --exclude-plan) EXCLUDE_PLANS+=("$2"); shift 2 ;;
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

# Alle Zyklus-Plaene (offen + archiviert) als '<slug>\t<plan-pfad>'.
_cycle_plans() {
  find "$1" -type f -name tasks.md -path '*mishap-incident-rollup-*' 2>/dev/null \
    | while IFS= read -r p; do
        printf '%s\t%s\n' "$(basename "$(dirname "$p")")" "$p"
      done | sort
}

# Titel aus einer offenen Eintragszeile.
_line_title() {
  printf '%s\n' "$1" | sed -E 's/^- \[.\] \*\*[0-9]+\. (.*)\*\* \(([^)]*)\).*$/\1/'
}
_line_meta() {
  printf '%s\n' "$1" | sed -E 's/^- \[.\] \*\*[0-9]+\. (.*)\*\* \(([^)]*)\).*$/\2/'
}

# Exclude-Filter [T013305]: ein Titel gilt als ausgeschieden, wenn er (nach
# Whitespace-Normalisierung) in der Exclude-Datei steht.
_is_excluded() {
  [[ -n "${EXCLUDE_FILE:-}" && -s "${EXCLUDE_FILE:-}" ]] || return 1
  local t; t="$(printf '%s' "$1" | tr -s '[:space:]' ' ')"
  while IFS= read -r ex; do
    ex="$(printf '%s' "$ex" | tr -s '[:space:]' ' ')"
    if [[ "$t" == "$ex" ]]; then return 0; fi
  done < "$EXCLUDE_FILE"
  return 1
}

# ── Modus: scan ─────────────────────────────────────────────────────────────
if [[ "$MODE" == "scan" ]]; then
  [[ -n "$SCAN_ROOT" && -n "$CONTAINER" ]] || {
    echo "rollup-carryover: --scan braucht --container" >&2; usage >&2; exit 2; }

  # Kandidaten sammeln, nach Zyklus-Datum sortiert.
  candidates=()
  while IFS= read -r plan; do
    [[ -f "$plan" ]] || continue
    rel_plan="${plan#"$SCAN_ROOT"/}"
    # Ein Zyklus ist fuer den Offline-Scan erst fertig, wenn sein Plan im
    # aktuellen Repository-HEAD publiziert ist. Untracked/branch-lokale Pläne
    # sind noch in Arbeit und duerfen nicht als Carry-over-Quelle dienen.
    git -C "$SCAN_ROOT" cat-file -e "HEAD:${rel_plan}" 2>/dev/null || continue
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
  done < <(find "$SCAN_ROOT/openspec/changes" -mindepth 2 -maxdepth 2 -type f \
    -path '*/mishap-incident-rollup-*/tasks.md' 2>/dev/null | sort)

  [[ "${#candidates[@]}" -gt 0 ]] || exit 3

  # Alle noch unarchivierten Zyklen bleiben Kandidaten. Ein vorausgegangener
  # Transfer ist erst dann dauerhaft erledigt, wenn sein Quell-Change
  # archiviert wurde; die direkte Pfadsuche oben schliesst archivierte Zyklen
  # aus. Die aufrufende Container-Logik dedupliziert je Quell-Zyklus.
  printf '%s\n' "${candidates[@]}" | sort | cut -f2,3
  exit 0
fi

# ── Modus: escalations [T013305 Mechanismus C] ───────────────────────────────
# Ein Eintrag, der in >= 2 ABGESCHLOSSENEN Zyklen offen blieb (sein Container
# ist nicht der laufende), wird zum Zombie — er wird eskaliert.
if [[ "$MODE" == "escalations" ]]; then
  [[ -n "$SCAN_ROOT" && -n "$CONTAINER" ]] || {
    echo "rollup-carryover: --escalations braucht --container" >&2; usage >&2; exit 2; }

  declare -A ESC_CYCLES=() ; declare -A ESC_META=() ; declare -A ESC_TITLE=()
  found=0
  while IFS=$'\t' read -r slug plan; do
    # Der laufende Zyklus zaehlt nicht — sein Container ist noch offen, der
    # Eintrag hat dort seine erste echte Chance.
    if [[ "$slug" == *-"$CONTAINER" ]]; then continue; fi
    while IFS= read -r line; do
      t="$(_line_title "$line")"; m="$(_line_meta "$line")"
      [[ -n "$t" ]] || continue
      key="$(printf '%s|%s' "$(printf '%s' "$t" | tr '[:upper:]' '[:lower:]' | tr -s '[:space:]' ' ')" \
                          "$(printf '%s' "$m" | tr '[:upper:]' '[:lower:]' | tr -s '[:space:]' ' ')")"
      if [[ -z "${ESC_TITLE[$key]:-}" ]]; then
        ESC_TITLE[$key]="$t"; ESC_META[$key]="$m"; ESC_CYCLES[$key]="$slug"
      elif [[ ";${ESC_CYCLES[$key]};" != *";${slug};"* ]]; then
        ESC_CYCLES[$key]="${ESC_CYCLES[$key]},${slug}"
      fi
    done < <(_open_entries "$plan")
  done < <(_cycle_plans "$SCAN_ROOT")

  for key in "${!ESC_TITLE[@]}"; do
    c="${ESC_CYCLES[$key]}"
    n="$(printf '%s' "$c" | awk -F',' '{print NF}')"
    [[ "$n" -ge 2 ]] || continue
    _is_excluded "${ESC_TITLE[$key]}" && continue
    printf '%s\t%s\t%s\n' "${ESC_TITLE[$key]}" "${ESC_META[$key]}" "$c"
    found=1
  done
  [[ "$found" -eq 1 ]] || exit 3
  exit 0
fi

# ── Modus: watchlist-live / watchlist-expired [T013305 Mechanismus B] ────────
# Dispositionszeilen 'beobachten (bis Zyklus <JJJJ-MM-TT>)' vergangener Plaene:
#   lebend  (heute <= Ablauf)  → Batch-Body zur Injektion in den Generatorlauf
#   abgelaufen (heute > Ablauf) → Eskalations-Zeile
if [[ "$MODE" == "wl_live" || "$MODE" == "wl_expired" ]]; then
  [[ -n "$SCAN_ROOT" && -n "$TODAY" ]] || {
    echo "rollup-carryover: --watchlist-* braucht --today" >&2; usage >&2; exit 2; }

  wl_found=0
  wl_titles=() wl_metas=() wl_dues=() wl_slugs=()
  while IFS=$'\t' read -r slug plan; do
    while IFS= read -r line; do
      parsed="$(printf '%s\n' "$line" | sed -nE 's/^- \[x\] \*\*[0-9]+\. (.*)\*\* \(([^)]*)\) .*Disposition: beobachten \(bis Zyklus ([0-9]{4}-[0-9]{2}-[0-9]{2})\).*$/\1\t\2\t\3/p')"
      [[ -n "$parsed" ]] || continue
      title="$(printf '%s' "$parsed" | cut -f1)"
      meta="$(printf '%s' "$parsed" | cut -f2)"
      due="$(printf '%s'  "$parsed" | cut -f3)"
      _is_excluded "$title" && continue
      if [[ "$MODE" == "wl_live" ]]; then
        # lebendig, solange heute <= Ablaufdatum (ISO-Datum: Stringvergleich)
        { [[ "$TODAY" < "$due" ]] || [[ "$TODAY" == "$due" ]]; } || continue
      else
        [[ "$TODAY" > "$due" ]] || continue
      fi
      wl_titles+=("$title"); wl_metas+=("$meta"); wl_dues+=("$due"); wl_slugs+=("$slug")
      wl_found=$((wl_found + 1))
    done < "$plan"
  done < <(_cycle_plans "$SCAN_ROOT")

  if [[ "$MODE" == "wl_expired" ]]; then
    i=0
    while [[ "$i" -lt "$wl_found" ]]; do
      printf '%s\t%s\t%s\t%s\n' "${wl_titles[$i]}" "${wl_metas[$i]}" "${wl_dues[$i]}" "${wl_slugs[$i]}"
      i=$((i + 1))
    done
    [[ "$wl_found" -gt 0 ]] || exit 3
    exit 0
  fi

  # Live: als Flusher-Batch rendern, damit die Injektion durch dieselbe Tuer
  # geht wie ein Carry-over (mishap-rollup.sh haengt den Body an COMMENTS_FILE).
  if [[ "$wl_found" -eq 0 ]]; then exit 3; fi
  printf '### Mishap-Rollup — %d Eintraege (Watchlist)\n\n' "$wl_found"
  printf 'Beobachtungspunkte vergangener Zyklen: diese Eintraege wurden als transient\n'
  printf 'eingeschaetzt, aber wiederholungsanfaellig befunden und laufen bis zu ihrem\n'
  printf 'Ablaufdatum in jedem Zyklus erneut auf. Danach Eskalation [T013305].\n\n'
  printf '| # | Typ | Komponente | Titel | Beobachten bis | Quelle |\n|---|---|---|---|---|---|\n'
  i=0
  while [[ "$i" -lt "$wl_found" ]]; do
    typ="${wl_metas[$i]%%,*}"
    komp="${wl_metas[$i]#*, }"
    printf '| %d | %s | %s | %s | %s | %s |\n' "$((i + 1))" "$typ" "$komp" \
      "${wl_titles[$i]}" "${wl_dues[$i]}" "${wl_slugs[$i]}"
    i=$((i + 1))
  done
  printf '\n'
  i=0
  while [[ "$i" -lt "$wl_found" ]]; do
    printf '**%d. %s** (%s)\n\n' "$((i + 1))" "${wl_titles[$i]}" "${wl_metas[$i]}"
    printf 'Watchlist-Eintrag aus `%s` — beobachten bis Zyklus %s.\n' "${wl_slugs[$i]}" "${wl_dues[$i]}"
    i=$((i + 1))
  done
  exit 0
fi

# ── Modus: plan ─────────────────────────────────────────────────────────────
if [[ "$MODE" != "plan" ]]; then
  echo "rollup-carryover: --plan oder --scan ist Pflicht" >&2; usage >&2; exit 2
fi
[[ -n "$PLAN" && -n "$SLUG" ]] || {
  echo "rollup-carryover: --plan braucht --slug" >&2; usage >&2; exit 2; }
[[ -f "$PLAN" ]] || { echo "rollup-carryover: Plan nicht lesbar: $PLAN" >&2; exit 2; }

declare -A EXCLUDED=()
for exclude_plan in "${EXCLUDE_PLANS[@]}"; do
  [[ -f "$exclude_plan" ]] || {
    echo "rollup-carryover: Ausschluss-Plan nicht lesbar: $exclude_plan" >&2; exit 2; }
  while IFS= read -r line; do
    key="$(printf '%s\n' "$line" | sed -E 's/^- \[ \] \*\*[0-9]+\. (.*\*\* \([^)]*\)).*$/\1/')"
    EXCLUDED["$key"]=1
  done < <(_open_entries "$exclude_plan")
done

OPEN=()
declare -A INCLUDED=()
while IFS= read -r line; do
  key="$(printf '%s\n' "$line" | sed -E 's/^- \[ \] \*\*[0-9]+\. (.*\*\* \([^)]*\)).*$/\1/')"
  [[ -n "${EXCLUDED[$key]:-}" || -n "${INCLUDED[$key]:-}" ]] && continue
  INCLUDED["$key"]=1
  OPEN+=("$line")
done < <(_open_entries "$PLAN")
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
# Eskalierte Eintraege (Exclude-Datei) sind ausgeschieden [T013305].
kept_titles=() kept_metas=()
for i in "${!titles[@]}"; do
  _is_excluded "${titles[$i]}" && continue
  kept_titles+=("${titles[$i]}")
  kept_metas+=("${metas[$i]}")
done
[[ "${#kept_titles[@]}" -gt 0 ]] || exit 3
titles=("${kept_titles[@]}"); metas=("${kept_metas[@]}")

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
