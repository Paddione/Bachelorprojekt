#!/usr/bin/env bats
# Prüfmodus: Output-Verifikation (T002448-M4) — schedule.sh wird AUSGEFÜHRT (echter
# Lauf mit FACTORY_GLOBAL_CAP=3, Claims werden gesetzt) und die Ticket-Status danach
# gemessen (ticket.sh get). Muster wie FA-SF-25 in scheduling.bats.
#
# Wächter gegen T005306: Der Dependency-Blocker-Gate in scripts/factory/schedule.sh
# fällt fail-open (json_agg(d.external_id) referenziert eine nicht existierende Spalte,
# die Query scheitert still, blocker_json bleibt leer) — Tickets werden trotz offener
# depends_on-Vorgänger geplant. Dieser Test friert das Verhalten ein: offener Blocker
# hält zurück, erfüllte Blocker lassen durch.

# [T003810/P2] Live-DB-Opt-in wie scheduling.bats: ohne TICKET_TEST_DB_OK=1
# repointet _ticket-core.sh unter BATS CTX auf den Sentinel — create liefe leer.
setup_file() { export TICKET_TEST_DB_OK=1; }

setup() {
  load '_sf_common.bash'
  _sf_setup
  REPO="${REPO_ROOT}"
  source "${REPO}/tests/lib/factory-test-fixtures.sh"
}

teardown() {
  _sf_teardown
}

@test "schedule.sh holds back a ticket with an open blocker" {
  _skip_if_no_db
  local brand="${TEST_BRAND:-korczewski}"

  # Blocker A bleibt offen (nicht done).
  local a b c
  a=$(seed_real_feature "$brand" "tests/fixtures/sf-blocker-$$-a.txt")
  b=$(seed_real_feature "$brand" "tests/fixtures/sf-blocker-$$-b.txt")
  c=$(seed_real_feature "$brand" "tests/fixtures/sf-blocker-$$-c.txt")
  # B hängt an A (offen), C hat keine Abhängigkeiten.
  bash "$REPO/scripts/ticket.sh" plan-meta set --id "$b" --depends-on "$a" >/dev/null 2>&1 \
    || { echo "plan-meta depends-on failed for $b" >&2; return 1; }

  run env BRAND="$brand" FACTORY_GLOBAL_CAP=3 bash "$REPO/scripts/factory/schedule.sh"
  [ "$status" -eq 0 ] || { echo "schedule.sh failed: $output" >&2; return 1; }

  # POSITIV-ANKER [T002356-M1]: C (ohne Blocker) MUSS geplant/geclaimt sein
  # (status=in_progress) — belegt, dass der Kandidat den Scheduling-Pfad erreicht.
  local c_status
  c_status=$(bash "$REPO/scripts/ticket.sh" get --id "$c" 2>/dev/null | jq -r '.status // empty')
  [ "$c_status" = "in_progress" ] \
    || { echo "unblocked candidate $c not claimed (status=$c_status)" >&2; return 1; }

  # NEGATIV-AUSSAGE: B (offener Blocker A) darf NICHT geplant/geclaimt sein.
  local b_status
  b_status=$(bash "$REPO/scripts/ticket.sh" get --id "$b" 2>/dev/null | jq -r '.status // empty')
  if [ "$b_status" = "in_progress" ]; then
    echo "blocked candidate $b was claimed (status=$b_status) — blocker gate fail-open" >&2
    return 1
  fi
}
