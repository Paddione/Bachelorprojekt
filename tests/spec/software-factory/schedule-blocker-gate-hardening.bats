#!/usr/bin/env bats
# Prüfmodus: Output-Verifikation (T002448-M4) — schedule.sh wird AUSGEFÜHRT (echter Lauf,
# FACTORY_GLOBAL_CAP=3) und Ticket-Status + Output gemessen. Muster wie
# schedule-blocker-gate.bats (T005306).
#
# Wächter gegen T005898: Der Blocker-Gate hielt `archived`- und dangling-Vorgänger für
# immer fest (IS DISTINCT FROM 'done' → NULL/archived = Block) und verwarf die berechnete
# blockers-Liste still. Dieser Guard friert ein: archived erfüllt den Gate, dangling
# blockt nicht (WARN statt Wedge), jeder Block emittiert eine WARN mit Blocker-Liste.

# [T003810/P2] Live-DB-Opt-in wie scheduling.bats.
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

# [T005898/Review PR #4472] Capacity-Pre-Check: der Test assertet in_progress-Übergänge
# unter FACTORY_GLOBAL_CAP=3 — ein belegter Slot-Pool (fremde echte Kandidaten, laufende
# Factory-Ticks) verfälscht die Assertions. Bedingter Skip, kein Dauer-Skip (T003548).
_skip_if_pool_busy() {
  local used
  used=$(env BRAND="${TEST_BRAND:-korczewski}" bash "${REPO}/scripts/factory/slots.sh" count 2>/dev/null | tail -1)
  if [ -n "$used" ] && [ "$used" -gt 0 ]; then
    skip "slot pool occupied ($used) — foreign candidates would falsify the assertions"
  fi
}

@test "archived blocker satisfies the gate" {
  _skip_if_no_db
  _skip_if_pool_busy
  local brand="${TEST_BRAND:-korczewski}"
  local a b c
  a=$(seed_real_feature "$brand" "tests/fixtures/sf-arch-$$-a.txt")
  b=$(seed_real_feature "$brand" "tests/fixtures/sf-arch-$$-b.txt")
  c=$(seed_real_feature "$brand" "tests/fixtures/sf-arch-$$-c.txt")
  bash "$REPO/scripts/ticket.sh" plan-meta set --id "$b" --depends-on "$a" >/dev/null 2>&1
  # Blocker A abschließen als archiviert (resolution obsolete).
  bash "$REPO/scripts/ticket.sh" update-status --id "$a" --status archived --resolution obsolete >/dev/null 2>&1 \
    || { echo "update-status archived failed for $a" >&2; return 1; }

  run env BRAND="$brand" FACTORY_GLOBAL_CAP=3 bash "$REPO/scripts/factory/schedule.sh"
  [ "$status" -eq 0 ] || { echo "schedule.sh failed: $output" >&2; return 1; }

  # Positiv-Anker: C (kein Blocker) wird geclaimed.
  local c_status
  c_status=$(bash "$REPO/scripts/ticket.sh" get --id "$c" 2>/dev/null | jq -r '.status // empty')
  [ "$c_status" = "in_progress" ] || { echo "unblocked candidate $c not claimed (status=$c_status)" >&2; return 1; }
  # Negativ-Aussage (RED heute): B mit ARCHIVIERTEM Blocker darf nicht hängen bleiben.
  local b_status
  b_status=$(bash "$REPO/scripts/ticket.sh" get --id "$b" 2>/dev/null | jq -r '.status // empty')
  [ "$b_status" = "in_progress" ] \
    || { echo "candidate $b with archived blocker was held (status=$b_status) — archived must satisfy the gate" >&2; return 1; }
}

@test "dangling predecessor does not wedge the candidate" {
  _skip_if_no_db
  _skip_if_pool_busy
  local brand="${TEST_BRAND:-korczewski}"
  local b c
  b=$(seed_real_feature "$brand" "tests/fixtures/sf-dang-$$-b.txt")
  c=$(seed_real_feature "$brand" "tests/fixtures/sf-dang-$$-c.txt")
  # depends_on auf eine nicht existierende ID — die Zeile gibt es nie.
  bash "$REPO/scripts/ticket.sh" plan-meta set --id "$b" --depends-on "T999999" >/dev/null 2>&1 \
    || { echo "plan-meta depends-on failed for $b" >&2; return 1; }

  run env BRAND="$brand" FACTORY_GLOBAL_CAP=3 bash "$REPO/scripts/factory/schedule.sh"
  [ "$status" -eq 0 ] || { echo "schedule.sh failed: $output" >&2; return 1; }

  # Positiv-Anker: C wird geclaimed.
  local c_status
  c_status=$(bash "$REPO/scripts/ticket.sh" get --id "$c" 2>/dev/null | jq -r '.status // empty')
  [ "$c_status" = "in_progress" ] || { echo "unblocked candidate $c not claimed" >&2; return 1; }
  # Negativ-Aussage (RED heute): B mit dangling-Referenz darf NICHT hängen bleiben.
  local b_status
  b_status=$(bash "$REPO/scripts/ticket.sh" get --id "$b" 2>/dev/null | jq -r '.status // empty')
  if [ "$b_status" != "in_progress" ]; then
    echo "candidate $b with dangling predecessor was held (status=$b_status) — dangling must not wedge" >&2
    return 1
  fi
}

@test "every block emits a WARN with the blocker list" {
  _skip_if_no_db
  _skip_if_pool_busy
  local brand="${TEST_BRAND:-korczewski}"
  local a b c
  a=$(seed_real_feature "$brand" "tests/fixtures/sf-warn-$$-a.txt")
  b=$(seed_real_feature "$brand" "tests/fixtures/sf-warn-$$-b.txt")
  c=$(seed_real_feature "$brand" "tests/fixtures/sf-warn-$$-c.txt")
  bash "$REPO/scripts/ticket.sh" plan-meta set --id "$b" --depends-on "$a" >/dev/null 2>&1

  run env BRAND="$brand" FACTORY_GLOBAL_CAP=3 bash "$REPO/scripts/factory/schedule.sh"
  [ "$status" -eq 0 ] || { echo "schedule.sh failed: $output" >&2; return 1; }

  # Positiv-Anker: C wird geclaimed (der Lauf erreicht den Scheduling-Pfad).
  local c_status
  c_status=$(bash "$REPO/scripts/ticket.sh" get --id "$c" 2>/dev/null | jq -r '.status // empty')
  [ "$c_status" = "in_progress" ] || { echo "unblocked candidate $c not claimed" >&2; return 1; }
  # Negativ-Aussage (RED heute): der Block von B muss eine WARN mit der Blocker-ID tragen.
  if ! echo "$output" | grep -q "WARN" || ! echo "$output" | grep -q "$a"; then
    echo "block of $b emitted no WARN with blocker $a — silent hold" >&2
    return 1
  fi
}
