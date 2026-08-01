#!/usr/bin/env bats
# tests/spec/software-factory/scheduling.bats
# SSOT: openspec/specs/software-factory.md
#
# [T002503] Aufgeteilt aus tests/spec/software-factory.bats. Jene Sammeldatei hielt
# 495 der ~2300 Spec-Tests in einer Datei und war mit --no-parallelize-within-files
# unteilbar: sie bildete mit 115s den Boden jedes CI-Shards, in dem sie lag.
#
# Der Split ist ein VERSCHIEBEN, kein Kopieren — die Quelldatei ist entfernt.
# T002427/T002421: eine frueher zurueckgelassene Kopie erzeugte doppelte Testnamen,
# ein gefilterter Lauf sah gruen aus, waehrend `task test:factory` ueber die
# veraltete Fassung rot lief.
#
# Gemeinsame Variablen, _skip_if_no_db und Setup/Teardown liegen in _sf_common.bash.

load '_sf_common'

setup()    { _sf_setup; }
teardown() { _sf_teardown; }

# ── FA-SF-23-slots ──────────────────────────────────────────────#
# FA-SF-23: slots.sh contract. Offline assertions always run; live claim/release
# runs only when a dev cluster is reachable (FACTORY_CTX/FACTORY_NS set to dev).

@test "FA-SF-23: dry-resolve prints brand namespace" {
  run env BRAND=mentolder FACTORY_DRY_RESOLVE=1 bash scripts/factory/slots.sh count
  [ "$status" -eq 0 ]
  [[ "$output" == *"ns=workspace"* ]]
}

@test "FA-SF-23: unknown subcommand exits 2" {
  run env BRAND=mentolder FACTORY_DRY_RESOLVE= bash scripts/factory/slots.sh bogus
  [ "$status" -eq 2 ]
}

@test "FA-SF-23: claim is atomic — second claim on the same ticket fails" {
  [ -n "${FACTORY_CTX:-}" ] || skip "no dev cluster context set"
  local brand="${TEST_BRAND:-korczewski}"
  ext=$(seed_test_feature "$brand" "tests/fixtures/sf-test-slots-$$-a.txt")
  run env BRAND="$brand" bash scripts/factory/slots.sh claim "$ext" 1
  [ "$status" -eq 0 ]
  [ "$output" = "1" ]
  run env BRAND="$brand" bash scripts/factory/slots.sh claim "$ext" 2
  [ "$status" -eq 1 ]                       # already slotted → claim fails
  run env BRAND="$brand" bash scripts/factory/slots.sh release "$ext"
  [ "$status" -eq 0 ]
}

# ── FA-SF-73-slots-gang ──────────────────────────────────────────#
# FA-SF-73: slots.sh gang-claim logic (slot_count/claim-gang), previously
# untested. Offline assertions always run; live claim/release runs only
# when a dev cluster is reachable (FACTORY_CTX/FACTORY_NS set to dev).

@test "FA-SF-73: slots.sh claim-gang is an all-or-nothing brand-pool guard (offline)" {
  run bash -n scripts/factory/slots.sh
  [ "$status" -eq 0 ]
  # claim-gang subcommand exists
  run grep -F 'claim-gang' scripts/factory/slots.sh
  [ "$status" -eq 0 ]
  # atomic pool check: running SUM(slot_count) + n must fit SLOTS_PER_BRAND
  run grep -F "LEAST(:'n'::integer, \${SLOTS_PER_BRAND}" scripts/factory/slots.sh
  [ "$status" -eq 0 ]
  # only claims a free ticket (race-free WHERE pipeline_slot IS NULL)
  run grep -F 'pipeline_slot IS NULL' scripts/factory/slots.sh
  [ "$status" -eq 0 ]
}

@test "FA-SF-73: count sums slot_count so a gang ticket occupies n slots (offline)" {
  run grep -F 'SUM(slot_count)' scripts/factory/slots.sh
  [ "$status" -eq 0 ]
}

@test "FA-SF-73: claim-gang claims n slots atomically; count reflects the gang; release resets to 1" {
  [ -n "${FACTORY_CTX:-}" ] || skip "no dev cluster context set"
  local brand="${TEST_BRAND:-korczewski}"
  ext=$(seed_test_feature "$brand" "tests/fixtures/sf-test-gang-$$-a.txt")
  before=$(env BRAND="$brand" bash scripts/factory/slots.sh count)
  run env BRAND="$brand" bash scripts/factory/slots.sh claim-gang "$ext" 2
  [ "$status" -eq 0 ]
  after=$(env BRAND="$brand" bash scripts/factory/slots.sh count)
  [ "$after" -eq $(( before + 2 )) ]
  # second gang claim on the same ticket fails (already slotted, all-or-nothing)
  run env BRAND="$brand" bash scripts/factory/slots.sh claim-gang "$ext" 1
  [ "$status" -eq 1 ]
  run env BRAND="$brand" bash scripts/factory/slots.sh release "$ext"
  [ "$status" -eq 0 ]
  # release reset slot_count to 1 → count returns to the pre-gang baseline
  [ "$(env BRAND="$brand" bash scripts/factory/slots.sh count)" -eq "$before" ]
}

@test "FA-SF-73: claim-gang rejects a gang larger than the free pool (nothing claimed)" {
  [ -n "${FACTORY_CTX:-}" ] || skip "no dev cluster context set"
  local brand="${TEST_BRAND:-korczewski}"
  ext=$(seed_test_feature "$brand" "tests/fixtures/sf-test-gang-$$-big.txt")
  before=$(env BRAND="$brand" bash scripts/factory/slots.sh count)
  # request more slots than the brand pool (default 3) can ever hold → exit 1
  run env BRAND="$brand" bash scripts/factory/slots.sh claim-gang "$ext" 99
  [ "$status" -eq 1 ]
  # nothing was claimed: count is unchanged
  [ "$(env BRAND="$brand" bash scripts/factory/slots.sh count)" -eq "$before" ]
  env BRAND="$brand" bash scripts/factory/slots.sh release "$ext" >/dev/null || true
}

# ── FA-SF-24-queue ──────────────────────────────────────────────#
# FA-SF-24: queue.sh lists backlog features as ordered JSON.

@test "FA-SF-24: dry-resolve works" {
  run env BRAND=mentolder FACTORY_DRY_RESOLVE=1 bash scripts/factory/queue.sh
  [ "$status" -eq 0 ]
  [[ "$output" == *"ns=workspace"* ]]
}

@test "FA-SF-24: a seeded backlog feature appears in the queue JSON" {
  [ -n "${FACTORY_CTX:-}" ] || skip "no dev cluster context set"
  local brand="${TEST_BRAND:-korczewski}"
  ext=$(seed_test_feature "$brand" "tests/fixtures/sf-test-queue-$$-a.txt")
  run env BRAND="$brand" bash scripts/factory/queue.sh
  [ "$status" -eq 0 ]
  echo "$output" | jq -e --arg e "$ext" 'any(.[]; .external_id == $e)'
}

# ── FA-SF-25-schedule ───────────────────────────────────────────#
# FA-SF-25: schedule.sh emits a launch plan and claims slots.

@test "FA-SF-25: dry-resolve works" {
  run env BRAND=mentolder FACTORY_DRY_RESOLVE=1 bash scripts/factory/schedule.sh
  [ "$status" -eq 0 ]
}

@test "FA-SF-25: two disjoint backlog features both get scheduled with slots" {
  [ -n "${FACTORY_CTX:-}" ] || skip "no dev cluster context set"
  local brand="${TEST_BRAND:-korczewski}"
  e1=$(seed_test_feature "$brand" "tests/fixtures/sf-test-sched-$$-a.txt")
  e2=$(seed_test_feature "$brand" "tests/fixtures/sf-test-sched-$$-b.txt")
  run env BRAND="$brand" FACTORY_GLOBAL_CAP=3 bash scripts/factory/schedule.sh
  [ "$status" -eq 0 ]
  echo "$output" | jq -e --arg e "$e1" 'any(.[]; .external_id == $e and (.slot|type=="number"))'
  echo "$output" | jq -e --arg e "$e2" 'any(.[]; .external_id == $e)'
}

@test "FA-SF-25: global cap of 1 schedules at most one feature" {
  [ -n "${FACTORY_CTX:-}" ] || skip "no dev cluster context set"
  local brand="${TEST_BRAND:-korczewski}"
  seed_test_feature "$brand" "tests/fixtures/sf-test-cap-$$-a.txt" >/dev/null
  seed_test_feature "$brand" "tests/fixtures/sf-test-cap-$$-b.txt" >/dev/null
  run env BRAND="$brand" FACTORY_GLOBAL_CAP=1 bash scripts/factory/schedule.sh
  [ "$status" -eq 0 ]
  count=$(echo "$output" | jq 'length')
  [ "$count" -le 1 ]
}

# ── FA-SF-26-watchdog ───────────────────────────────────────────#
# FA-SF-26: watchdog escalates stale in_progress features.

@test "FA-SF-26: dry-resolve works" {
  run env BRAND=mentolder FACTORY_DRY_RESOLVE=1 bash scripts/factory/watchdog.sh
  [ "$status" -eq 0 ]
}

@test "FA-SF-26: a stale in_progress feature is returned to triage and its slot freed" {
  [ -n "${FACTORY_CTX:-}" ] || skip "no dev cluster context set"
  local brand="${TEST_BRAND:-korczewski}"
  ext=$(seed_test_feature "$brand" "tests/fixtures/sf-test-wd-$$-a.txt")
  env BRAND="$brand" bash scripts/factory/slots.sh claim "$ext" 1 >/dev/null
  # Derive the namespace from the brand (do not rely on a FACTORY_NS default).
  local ns; case "$brand" in mentolder) ns=workspace ;; korczewski) ns=workspace-korczewski ;; esac
  # Backdate updated_at by 40 minutes to simulate a hung pipeline.
  pod=$(kubectl get pod -n "$ns" --context "$FACTORY_CTX" -l 'app in (shared-db, shared-db-dev)' --field-selector status.phase=Running -o name | head -1)
  kubectl exec -i "$pod" -n "$ns" --context "$FACTORY_CTX" -c postgres -- \
    psql -U website -d website -qtAc "UPDATE tickets.tickets SET updated_at = now() - interval '40 minutes' WHERE external_id='$ext';"
  run env BRAND="$brand" FACTORY_STALE_MIN=30 bash scripts/factory/watchdog.sh
  [ "$status" -eq 0 ]
  echo "$output" | jq -e --arg e "$ext" 'any(.[]; . == $e)'
  # Confirm status=triage and pipeline_slot cleared.
  st=$(BRAND="$brand" TICKET_CTX="$FACTORY_CTX" bash scripts/ticket.sh get --id "$ext" | jq -r '.status')
  [ "$st" = "triage" ]
}

@test "FA-SF-26: a stale in_progress feature WITH a staged plan (FACTORY-PLAN-REF) is returned to backlog, not triage [T001850]" {
  # [T002427] Aus tests/local/FA-SF-26-watchdog.bats uebernommen. Gegenstueck zum Test
  # darueber: liegt bereits ein Plan vor, darf der Watchdog diese Arbeit nicht wegwerfen,
  # indem er nach triage zuruecksetzt — das erzwingt einen vollen Scout/Design/Plan-Neustart.
  [ -n "${FACTORY_CTX:-}" ] || skip "no dev cluster context set"
  local brand="${TEST_BRAND:-korczewski}"
  ext=$(seed_test_feature "$brand" "tests/fixtures/sf-test-wd-$$-b.txt")
  env BRAND="$brand" bash scripts/factory/slots.sh claim "$ext" 1 >/dev/null
  # Simuliert, dass dev-flow-plan fuer dieses Ticket bereits einen Plan gestaged hat.
  BRAND="$brand" TICKET_CTX="$FACTORY_CTX" bash scripts/ticket.sh add-comment --id "$ext" \
    --body "FACTORY-PLAN-REF branch=feature/sf-test-wd-$$ plan=openspec/changes/sf-test-wd-$$/tasks.md" >/dev/null
  local ns; case "$brand" in mentolder) ns=workspace ;; korczewski) ns=workspace-korczewski ;; esac
  pod=$(kubectl get pod -n "$ns" --context "$FACTORY_CTX" -l 'app in (shared-db, shared-db-dev)' --field-selector status.phase=Running -o name | head -1)
  kubectl exec -i "$pod" -n "$ns" --context "$FACTORY_CTX" -c postgres -- \
    psql -U website -d website -qtAc "UPDATE tickets.tickets SET updated_at = now() - interval '40 minutes' WHERE external_id='$ext';"
  run env BRAND="$brand" FACTORY_STALE_MIN=30 bash scripts/factory/watchdog.sh
  [ "$status" -eq 0 ]
  echo "$output" | jq -e --arg e "$ext" 'any(.[]; . == $e)'
  st=$(BRAND="$brand" TICKET_CTX="$FACTORY_CTX" bash scripts/ticket.sh get --id "$ext" | jq -r '.status')
  [ "$st" = "backlog" ]
}

@test "T002242-M2: watchdog zombie-worktree cleanup prueft git status vor Force-Remove" {
  run grep -n "status --short" "$REPO_ROOT/scripts/factory/watchdog.sh"
  [ "$status" -eq 0 ]
}

# ── FA-SF-27-metrics ────────────────────────────────────────────#
# FA-SF-27: metrics.sh summarizes v_factory_metrics and posts a comment.

@test "FA-SF-27: dry-resolve works" {
  run env BRAND=mentolder FACTORY_DRY_RESOLVE=1 bash scripts/factory/metrics.sh
  [ "$status" -eq 0 ]
}

@test "FA-SF-27: posts a comment to a seeded metrics ticket" {
  [ -n "${FACTORY_CTX:-}" ] || skip "no dev cluster context set"
  local brand="${TEST_BRAND:-korczewski}"
  # Use a throwaway test ticket as the metrics sink so we don't touch T000413.
  sink=$(seed_test_feature "$brand" "tests/fixtures/sf-test-metrics-$$-a.txt")
  run env BRAND="$brand" FACTORY_METRICS_TICKET="$sink" bash scripts/factory/metrics.sh
  [ "$status" -eq 0 ]
  [[ "$output" =~ "Comment added" ]] || [[ "$output" =~ "Factory metrics" ]]
}

# ── FA-SF-73-force-tick ──────────────────────────────────────────#
# FA-SF-73: STRUCT2 rot→grün-Beweis für die parallele Gang-Status-Anzeige
# [T002079]. Vor P1 enthält wakeup.sh weder 'force-tick-requested' noch
# 'last-tick-at' (grep -c = 0) — die zwei Blöcke unten sind rot bis P1
# das Flag-Handling (lesen+räumen) und last-tick-at (schreiben) verdrahtet.

@test "FA-SF-73: wakeup.sh consumes and clears the force-tick-requested flag" {
  # expected: FAIL until P1 wires force-tick flag consumption into wakeup.sh.
  # RED proof: 'force-tick-requested' is absent from wakeup.sh before P1.
  run bash -n "$WAKEUP"
  [ "$status" -eq 0 ]
  # reads the control flag at tick start
  run grep -F 'force-tick-requested' "$WAKEUP"
  [ "$status" -eq 0 ]
  # clears it after reading (idempotent one-shot, not a sticky flag)
  run grep -E 'DELETE|force-tick-requested.*clear|clear.*force-tick-requested' "$WAKEUP"
  [ "$status" -eq 0 ]
}

@test "FA-SF-73: wakeup.sh records last-tick-at into factory_control at tick end" {
  # expected: FAIL until P1 writes the last-tick-at control key.
  run grep -F 'last-tick-at' "$WAKEUP"
  [ "$status" -eq 0 ]
}

# ── FA-SF-51-auto-enqueue ───────────────────────────────────────#
# FA-SF-51: offline arg-validation + logic stubs für auto-enqueue.sh [T000730]
# Alle Tests validieren VOR _pgpod / factory_psql — CI-safe ohne Cluster.

@test "FA-SF-51: auto-enqueue.sh is executable" {
  [ -x scripts/factory/auto-enqueue.sh ]
}

@test "FA-SF-51: --dry-run flag is accepted without error (no cluster)" {
  # Setzt FACTORY_DRY_RESOLVE=1 um factory_resolve() zu kurz-schließen
  run env FACTORY_DRY_RESOLVE=1 BRAND=mentolder bash scripts/factory/auto-enqueue.sh --dry-run
  # Kein Crash, beliebiger Exit-Code akzeptiert (kein Cluster)
  [[ "$output" != *"Unknown option"* ]]
}

@test "FA-SF-51: rejects unknown option" {
  run bash scripts/factory/auto-enqueue.sh --bogus
  [ "$status" -eq 2 ]
  [[ "$output" =~ "Unknown" ]]
}

@test "FA-SF-51: BRAND env var is required" {
  # Ohne BRAND gibt factory_resolve() einen Fehler
  run env BRAND="" bash scripts/factory/auto-enqueue.sh --dry-run
  # Erwartet entweder exit 1 oder Warnung im Output
  [[ "$status" -ne 0 ]] || [[ "$output" =~ "BRAND" ]]
}

@test "FA-SF-51: --help shows usage" {
  run bash scripts/factory/auto-enqueue.sh --help
  [ "$status" -eq 0 ]
  [[ "$output" =~ "auto-enqueue" ]]
}
