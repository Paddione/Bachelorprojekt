#!/usr/bin/env bash
# scripts/find-dead-selections.sh — Selection-Integrity-Audit fuer Spec-Guards.
#
# Ein Spec-Guard ist SELECTION-LIVE, wenn eine Produkt-Aenderung ihn ueber
# scripts/find-changed-tests.sh ausloesen kann: ein aktueller Repo-Pfad (oder
# 2+-segmentiger Vorfahr — exakt die probe_spec_for_path-Regel inkl. T006999-
# Floor) kommt in ihm vor, oder er ist name-mapped (scripts/<name>.*), oder
# openspec-slug-mapped. Was davon nichts erfuellt, laeuft nur noch ueber
# RUN_ALL/direkte Aenderung/Nightly — bei einem Move unbemerkt (T900677).
#
# Der Soll-Stand steht in tests/spec/selection-integrity/live-snapshot.txt.
# Aendert sich die Auswahl (neue/umbenannte/geloeschte Specs, Reorg-Moves),
# meldet --check das — Fix: --snapshot neu schreiben und mitcommitten
# (gleicher Flow wie test-inventory.json).
#
#   --live       sortierte Live-Liste nach stdout (relative Pfade)
#   --snapshot   Snapshot regenerieren (Arbeitsbaum)
#   --check      Default: Lost-Selection + Stale + Snapshot-Exaktheit pruefen
#
# Exit: --check 0 = Snapshot exakt, kein Lost/Stale; 1 = sonst. --live und
# --snapshot immer 0. Keine History noetig (shallow-CI-safe): Vergleichsbasis
# ist der committete Snapshot, kein Zeitfenster.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

SPEC_DIR="tests/spec"
SNAPSHOT="tests/spec/selection-integrity/live-snapshot.txt"

MODE="check"
for arg in "$@"; do
  case "$arg" in
    --live) MODE="live" ;;
    --snapshot) MODE="snapshot" ;;
    --check) MODE="check" ;;
    -h|--help)
      sed -n '2,/^$/p' "${BASH_SOURCE[0]}" | sed 's/^# \?//'
      echo "Usage: bash scripts/find-dead-selections.sh [--live|--snapshot|--check]"
      exit 0 ;;
    *) echo "unknown argument: $arg" >&2; exit 2 ;;
  esac
done

_tmp="$(mktemp -d)"
trap 'rm -rf "$_tmp"' EXIT

# ── Pfad-Universum (spiegelt probe_spec_for_path) ──────────────────────────
# Geprobt werden nur Strings mit Slash (Schleifenbedingung */*); Vorfahren bis
# hinunter zu 2 Segmenten; components/<name> (2 Segmente) nie (T006999-Floor).
# tests/spec/** ist ausgenommen: Spec-Aenderungen gehen direkt auf die Datei
# (continue-Zweig) und proben nie — eine Spec-Pfad-Erwähnung (auch die eigene
# Kopfzeile) erzeugt keinen Auswahl-Link.
git ls-files | grep / | grep -v '^tests/spec/' | grep . | sort -u > "$_tmp/files.txt"
awk -F/ '{out=$1; for(i=2;i<NF;i++){out=out"/"$i; print out}}' "$_tmp/files.txt" \
  | grep / | grep -vE '^components/[^/]+$' | grep . | sort -u > "$_tmp/dirs.txt"
cat "$_tmp/files.txt" "$_tmp/dirs.txt" | sort -u > "$_tmp/universe.txt"

# ── Live via Pfad-Erwähnung ───────────────────────────────────────────────
grep -rlF -f "$_tmp/universe.txt" "$SPEC_DIR" --include='*.bats' 2>/dev/null | sort -u > "$_tmp/live-refs.txt" || true

# ── Live via Name-Mapping (find-changed-tests.sh, scripts/*-Zweig) ─────────
# foo.bats (jede Tiefe) ist selektierbar, wenn scripts/foo.* existiert;
# vda-/ticket-/factory-Praeixe und -check-Strip werden invers aufgeloest.
: > "$_tmp/live-names.txt"
while IFS= read -r bats; do
  [ -n "$bats" ] || continue
  base="$(basename "$bats" .bats)"
  for cand in "$base" "${base#vda-}" "${base#ticket-}" "${base#factory-}"; do
    if ls "scripts/${cand}.sh" "scripts/${cand}.mjs" "scripts/${cand}.js" "scripts/${cand}.ts" >/dev/null 2>&1; then
      echo "$bats" >> "$_tmp/live-names.txt"
      break
    fi
  done
  if ! grep -qxF "$bats" "$_tmp/live-names.txt" 2>/dev/null; then
    if [ -f "scripts/${base}-check.sh" ]; then
      echo "$bats" >> "$_tmp/live-names.txt"
    fi
  fi
  # Openspec-Slug-Mapping: openspec/changes/<slug>/* -> tests/spec/<slug>.bats
  case "$bats" in
    "$SPEC_DIR/"*.bats)
      if [ "$bats" = "$SPEC_DIR/${base}.bats" ] && [ -d "openspec/changes/${base}" ]; then
        echo "$bats" >> "$_tmp/live-names.txt"
      fi
      ;;
  esac
done < <(find "$SPEC_DIR" -name '*.bats' -type f | sort)

cat "$_tmp/live-refs.txt" "$_tmp/live-names.txt" | grep . | sort -u > "$_tmp/live.txt" || true

if [ "$MODE" = "live" ]; then
  cat "$_tmp/live.txt"
  exit 0
fi

if [ "$MODE" = "snapshot" ]; then
  {
    echo "# live-snapshot.txt — selection-live Spec-Guards (eine Zeile pro Datei)."
    echo "# Regenerieren: bash scripts/find-dead-selections.sh --snapshot"
    echo "# Geprueft von: tests/spec/selection-integrity/dead-selections.bats"
    cat "$_tmp/live.txt"
  } > "$SNAPSHOT"
  echo "snapshot: $(wc -l < "$_tmp/live.txt") live spec files -> $SNAPSHOT" >&2
  exit 0
fi

# ── --check ────────────────────────────────────────────────────────────────
if [ ! -f "$SNAPSHOT" ]; then
  echo "selection-integrity: MISSING $SNAPSHOT — regenerate: bash scripts/find-dead-selections.sh --snapshot" >&2
  exit 1
fi
grep -v '^#' "$SNAPSHOT" | grep . | sort -u > "$_tmp/snap.txt" || true

lost=0; stale=0; missing=0
while IFS= read -r s; do
  [ -n "$s" ] || continue
  if [ ! -f "$s" ]; then
    echo "stale: snapshot entry deleted from repo: $s"
    stale=$((stale + 1))
  elif ! grep -qxF "$s" "$_tmp/live.txt"; then
    echo "lost-selection: $s matches no current path, name mapping, or openspec slug"
    lost=$((lost + 1))
  fi
done < "$_tmp/snap.txt"

while IFS= read -r l; do
  [ -n "$l" ] || continue
  if ! grep -qxF "$l" "$_tmp/snap.txt"; then
    echo "snapshot-incomplete: live file not in snapshot: $l"
    missing=$((missing + 1))
  fi
done < "$_tmp/live.txt"

live_n=$(wc -l < "$_tmp/live.txt" | tr -d ' ')
snap_n=$(wc -l < "$_tmp/snap.txt" | tr -d ' ')
echo "selection-integrity: live=${live_n} snapshot=${snap_n} lost=${lost} stale=${stale} incomplete=${missing}"
if [ "$lost" -gt 0 ] || [ "$stale" -gt 0 ] || [ "$missing" -gt 0 ]; then
  echo "fix: bash scripts/find-dead-selections.sh --snapshot && git add $SNAPSHOT" >&2
  exit 1
fi
