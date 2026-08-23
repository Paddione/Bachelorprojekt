#!/usr/bin/env bats
# tests/spec/software-factory/bounce-loop-guard.bats — T015556
#
# Guards gegen den INFRA-Dispatch-Bounce-Loop (T014546/T014551, 2026-08-23):
# 1. schedule.sh claimed keinen Gang-Slot fuer planlose Rows (Claim-vor-
#    Readiness liess Tickets stranden: in_progress ohne Pipeline).
# 2. Watchdog: unlesbarer INFRA-Counter wird sichtbar gemacht und blockiert
#    die Eskalation nicht ewig ([INFRA ?/3] lief endlos).
# 3. Watchdog: DB-Identitaetscheck vor Reset-Writes (Counter landete auf der
#    fremden DB, Status/Kommentar in der SSOT — Split-Brain).
# 4. STALE_MIN-Floor: Prod-Sweeps mit STALE_MIN=0 ("stale > 0min" in
#    Bounce-Kommentaren) brauchen ein explizites Opt-out.
#
# Strukturelle Guards nach dem Muster watchdog-parallel-isolation.bats
# (T005561): deterministisch, ohne DB-Zugriff, CI-sicher.

setup() {
  load '../test_helper.bash'
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
}

@test "T015556-1: schedule.sh prueft Launch-Readiness VOR claim-gang" {
  local f="$REPO_ROOT/scripts/factory/schedule.sh"
  [ -f "$f" ] || { echo "Datei fehlt: $f" >&2; return 1; }
  # claim-gang-Zeile finden; davor muss ein Readiness-Gate liegen.
  local claim_line gate_line
  claim_line=$(grep -n 'claim-gang' "$f" | head -1 | cut -d: -f1)
  [ -n "$claim_line" ] || { echo "claim-gang nicht gefunden" >&2; return 1; }
  gate_line=$(grep -n 'check_ticket_readiness' "$f" | head -1 | cut -d: -f1)
  if [ -z "$gate_line" ]; then
    echo "T015556: schedule.sh hat keinen check_ticket_readiness-Gate vor dem Claim — planlose Feats werden geclaimt und stranden auf in_progress" >&2
    return 1
  fi
  [ "$gate_line" -lt "$claim_line" ] \
    || { echo "T015556: Readiness-Gate (Zeile $gate_line) liegt NACH claim-gang (Zeile $claim_line)" >&2; return 1; }
}

@test "T015556-2: Watchdog-Counter ist sichtbar und eskaliert bei unlesbaren Runden" {
  local f="$REPO_ROOT/scripts/factory/watchdog.sh"
  [ -f "$f" ] || { echo "Datei fehlt: $f" >&2; return 1; }
  if grep -q 'factory_psql.*2>/dev/null <<' "$f"; then
    echo "T015556: Counter-Aufruf verschluckt Fehler weiterhin via 2>/dev/null — '?'-Zähler bleibt unaufklaerbar" >&2
    return 1
  fi
  grep -q 'factory_infra_unreadable' "$f" \
    || { echo "T015556: kein Fail-safe-Zaehler fuer konsekutive unlesbare Runden (factory_infra_unreadable)" >&2; return 1; }
  grep -q 'ERR' "$f" \
    || { echo "T015556: Bounce-Kommentar kennzeichnet unlesbaren Zaehler nicht als ERR" >&2; return 1; }
}

@test "T015556-3: Watchdog prueft DB-Identitaet vor Reset-Writes" {
  local f="$REPO_ROOT/scripts/factory/watchdog.sh"
  grep -qE 'identity|identit|DB-Mismatch|db_identity|marker' "$f" \
    || { echo "T015556: kein DB-Identitaetscheck zwischen factory_psql- und ticket.sh-Pfad — Split-Brain-Resets moeglich" >&2; return 1; }
}

@test "T015556-4: STALE_MIN unter 5 braucht explizites Opt-out" {
  local f="$REPO_ROOT/scripts/factory/watchdog.sh"
  grep -q 'FACTORY_ALLOW_STALE_MIN_ZERO' "$f" \
    || { echo "T015556: kein Floor fuer FACTORY_STALE_MIN<5 — 'stale > 0min'-Sweeps gegen die geteilte Dev-DB bleiben moeglich" >&2; return 1; }
}
