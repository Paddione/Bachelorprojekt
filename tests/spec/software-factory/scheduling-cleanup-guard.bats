#!/usr/bin/env bats
# Prüfmodus: gemischt — Tests 1+2 strukturell (Source-Grep auf die Test-Datei, T002448-M4-
# Ausnahme für Konventions-Guards), Test 3 Output-/Verhaltens-Verifikation gegen die Dev-DB.
#
# Wächter gegen T005309: purge_real_feature-Aufrufe standen am Ende der Test-Bodies —
# unter BATS-errexit bricht eine fehlgeschlagene Assertion vor dem Purge ab und hinterlässt
# Ghost-Seeds (status=in_progress) in der Dev-DB. Dieser Guard friert ein: Seeds werden
# registriert, im teardown gepurged, und purge weigert sich bei Nicht-SF-REAL-Titeln.

# [T003810/P2] Live-DB-Opt-in (dasselbe Muster wie scheduling.bats): ohne
# TICKET_TEST_DB_OK=1 repointet _ticket-core.sh unter BATS CTX auf den Sentinel
# "bats-no-cluster-t002224" — ticket.sh create liefe leer und Test 3 skippte
# statt zu messen (T005309/T003548-Wächter).
setup_file() { export TICKET_TEST_DB_OK=1; }

setup() {
  load '_sf_common.bash'
  _sf_setup
  REPO="${REPO_ROOT}"
  SCHED="${REPO}/tests/spec/software-factory/scheduling.bats"
  [ -f "$SCHED" ] || skip "scheduling.bats not found"
  FIXTURES="${REPO}/tests/lib/factory-test-fixtures.sh"
  [ -f "$FIXTURES" ] || skip "factory-test-fixtures.sh not found"
  source "$FIXTURES"
}

teardown() {
  _sf_teardown
}

@test "seed_real_feature registers its id for teardown cleanup" {
  _skip_if_no_db
  local brand=mentolder ext
  ext=$(seed_real_feature "$brand" "tests/fixtures/sf-cleanup-guard-$$.txt")
  # Positiv-Anker: die Registry-Datei existiert und enthält die gespeicherte ID.
  [ -f "$BATS_FILE_TMPDIR/sf-seeded-ids" ] \
    || { echo "registry file missing after seed" >&2; purge_real_feature "$brand" "$ext"; return 1; }
  grep -qxF "$ext" "$BATS_FILE_TMPDIR/sf-seeded-ids" \
    || { echo "seeded id not registered" >&2; purge_real_feature "$brand" "$ext"; return 1; }
  # Zusätzlich manuell purgen — der Teardown purgt registrierte IDs ebenfalls;
  # die Doppel-Löschung ist idempotent (0 Zeilen, Exit 0).
  purge_real_feature "$brand" "$ext"
}

@test "scheduling.bats test bodies do not purge their own seeds" {
  # awk-Range-Analyse: innerhalb jedes @test-Blocks darf kein purge_real_feature stehen.
  # RED solange die Bodies purgen (scheduling.bats:150, 173-174, 190-191).
  if awk '
    /^@test / { in_test = 1 }
    in_test && /purge_real_feature/ { print "purge in test body at line " NR; found = 1 }
    in_test && /^}/ { in_test = 0 }
    END { exit found ? 1 : 0 }
  ' "$SCHED"; then
    :
  else
    return 1
  fi
}

@test "purge_real_feature refuses non-SF-REAL titles" {
  _skip_if_no_db
  local brand=mentolder
  # Eigenes Test-Ticket mit Titel OHNE SF-REAL-Prefix anlegen (is_test_data=true, damit
  # fn_purge_test_data es später wegräumen kann).
  local created
  created=$(bash "$REPO/scripts/ticket.sh" create \
    --type fix --brand "$brand" --is-test-data \
    --title "cleanup-guard-refusal-$$" \
    --description "temporary fixture for scheduling-cleanup-guard (T005309)" 2>/dev/null | cut -d'|' -f1)
  [ -n "$created" ] || skip "ticket.sh create failed (offline?)"
  # Positiv-Anker: das Ticket existiert vor dem purge-Versuch.
  bash "$REPO/scripts/ticket.sh" get --id "$created" >/dev/null 2>&1 \
    || { echo "ticket $created not found before purge" >&2; return 1; }
  # Der Guard-Aufruf darf NICHTS löschen (Titel ohne SF-REAL-) und muss das
  # unterscheidbar melden (exit != 0; run statt nacktem Aufruf, damit errexit
  # den Test nicht vor der Assertion abbricht).
  run purge_real_feature "$brand" "$created"
  [ "$status" -ne 0 ] || { echo "purge succeeded despite non-SF-REAL title — guard missing" >&2; return 1; }
  bash "$REPO/scripts/ticket.sh" get --id "$created" >/dev/null 2>&1 \
    || { echo "non-SF-REAL ticket was deleted — guard missing" >&2; return 1; }
  # Aufräumen: eigenes Ticket hart entfernen (Test-Fixture, is_test_data=true).
  # --force übergeht den Titel-Guard — genau der Zweck des Flags.
  run purge_real_feature --force "$brand" "$created"
  [ "$status" -eq 0 ] || { echo "purge --force failed for own fixture" >&2; return 1; }
}
