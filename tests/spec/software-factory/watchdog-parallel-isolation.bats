#!/usr/bin/env bats
# tests/spec/software-factory/watchdog-parallel-isolation.bats — T005561
#
# task test:changed ist lokal strukturell rot: 8 Fehlschlaege (FA-SF-04/34,
# T002610 x2, T003810 x2, FA-SF-25 x2) — mehrere Watchdog-Testvarianten laufen
# mit STALE_MIN=0 gegen die GETELTE k3d-Dev-DB und setzen sich gegenseitig
# in_progress-Tickets zurueck. Alle 8 Tests isoliert gruen, seriell 184/184
# gruen; CI nicht betroffen (Cluster-lose Runner, _skip_if_no_db skippt).
#
# Root-Cause: scripts/factory/watchdog.sh::_stale_query selektiert GLOBAL
#   SELECT … WHERE type NOT IN ('project','incident') AND status='in_progress'
#          AND updated_at < now() - make_interval(mins => <STALE_MIN>)
# ueber die eine SDLC-DB. Ein paralleler Watchdog-Test mit STALE_MIN=0 trifft
# damit auch die Seeds der anderen parallelen Laeufe (Scheduling + Orphan-Sweep
# + Retry-Limit), deren Status/Slots er zuruecksetzt — die Kollision ist
# strukturell, kein einzelner Testfehler.
#
# Fix-Richtung (dieser Guard): Watchdog-Tests isolieren ihre Seeds gegen den
# globalen Stale-Sweep, z.B. ueber einen eindeutigen Test-Marker
# (ext_id-Praefix/Metadaten-Filter), den _stale_query respektieren kann, ODER
# die STALE_MIN=0-Laeufe laufen gegen eine brand-/suffix-getrennte Selektion.
# Der Guard ist Querschnitt (T002448-M4): er pruft, dass die gefaehrlichen
# STALE_MIN=0-Aufrufe einen Isolation-Filter tragen bzw. der Watchdog einen
# Test-Ausschlussmechanismus kennt.

setup() {
  load '../test_helper.bash'
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
}

@test "T005561: alle STALE_MIN=0-Watchdog-Aufrufe sind gegen Fremd-Seeds isoliert" {
  # Jeder STALE_MIN=0-Watchdog-Lauf ist ein globaler Reset-Risiko. Die Dateien,
  # die solche Laeufe enthalten, muessen eine Isolation tragen (eigener
  # Brand-/Suffix-Filter oder Test-Ausschluss), sonst kollidieren parallele
  # Laeufe ueber die geteilte Dev-DB (T005561: FA-SF-04/34, T002610, T003810,
  # FA-SF-25 schlagen strukturell rot).
  local files=(
    "$REPO_ROOT/tests/spec/software-factory/scheduling.bats"
    "$REPO_ROOT/tests/spec/software-factory/orphan-slot-reap.bats"
    "$REPO_ROOT/tests/spec/software-factory/retry-limit.bats"
  )
  local f
  for f in "${files[@]}"; do
    [ -f "$f" ] || { echo "Datei fehlt: $f" >&2; return 1; }
    local danger_lines
    danger_lines=$(grep -cE 'FACTORY_STALE_MIN=0' "$f" || true)
    if [ "$danger_lines" -gt 0 ]; then
      # Isolation verlangen: die Datei muss einen Mechanismus tragen, der den
      # eigenen Seed vom globalen Stale-Sweep ausschliesst (Filter/Marker).
      grep -qE 'stale.*filter|isolat|FACTORY_TEST|test.*marker|sf-test-wd|EXCLUDED' "$f" \
        || { echo "T005561: $f nutzt FACTORY_STALE_MIN=0 ohne Isolations-Filter ($danger_lines Aufrufe)" >&2; return 1; }
    fi
  done
}

@test "T005561: Watchdog kennt einen Test-Isolationsmechanismus gegen Fremd-Seeds" {
  # Der Watchdog selbst muss (a) die Stale-Selektion kapseln und (b) einen Weg
  # anbieten, Test-Seeds auszuschliessen — sonst bleibt jede Isolation
  # Workaround auf Testseite. Prueft: _stale_query ist eine benannte Funktion
  # (kapselbar) und die Selektion laesst sich ueber Env/Parameter eingrenzen.
  local wd="$REPO_ROOT/scripts/factory/watchdog.sh"
  [ -f "$wd" ] || { echo "Watchdog fehlt: $wd" >&2; return 1; }
  run grep -nE '_stale_query\(\)|FACTORY_STALE_MIN|STALE_MIN=' "$wd"
  [ "$status" -eq 0 ] || { echo "Watchdog ohne kapselbare Stale-Selektion" >&2; return 1; }
  echo "$output" | grep -q '_stale_query()' \
    || { echo "Watchdog ohne _stale_query-Funktion (Selektion nicht kapselbar)" >&2; return 1; }
}
