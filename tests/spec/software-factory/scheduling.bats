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

# [T003810/P2] Live-DB-Opt-in: TICKET_TEST_DB_OK=1 hebt den BATS-Sentinel-Kontext
# (bats-no-cluster-t002224) auf, damit seed_test_feature und die slots/queue/
# schedule/watchdog-Aufrufe gegen die echte Dev-DB laufen (dasselbe Muster wie
# orphan-slot-reap.bats). Der fruehere Skip-Guard "FACTORY_CTX gesetzt" gruendete
# auf dem lib.sh-Zustand VOR T003544 (Default erst in factory_resolve_data_ns);
# seit dem Top-Level-Default ist FACTORY_CTX beim Source bereits gesetzt und der
# Guard wirkungslos — der Skip haengt jetzt an der Pod-Erreichbarkeit
# (_skip_if_no_db), nicht an einer Variablenbelegung.
setup_file() { export TICKET_TEST_DB_OK=1; }

# factory-test-fixtures traegt die Endung .sh und ist damit nicht ueber `load`
# erreichbar (bats sucht .bash); die Bestandstests sourcen es ebenso direkt
# (Vorlage: orphan-slot-reap.bats). Ohne diesen Source scheitert jeder Live-Test
# in dieser Datei, der `seed_test_feature` aufruft, mit "command not found"
# (status 127) statt mit einem aussagekraeftigen Ergebnis.
setup()    { _sf_setup; source tests/lib/factory-test-fixtures.sh; }
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
  _skip_if_no_db
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
  _skip_if_no_db
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
  _skip_if_no_db
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
  # [T005029] queue.sh filtert seit T002830 `is_test_data = false` — SF-TEST-Fixtures
  # duerfen nie im Dispatch-Pfad landen. Die urspruengliche Erwartung (SF-TEST-Feature
  # erscheint in der Queue) bildete den Filter nicht ab und war damit dauerhaft rot.
  # POSITIV-ANKER [T002356-M1]: ein is_test_data=false-Feature MUSS erscheinen —
  # belegt, dass queue.sh backlog-Features ueberhaupt listet. seed_real_feature ist die
  # Fixture-Helferin aus tests/lib/factory-test-fixtures.sh (Implementierung dieses
  # Tickets); ohne sie schlaegt der Test mit status 127 fehl.
  _skip_if_no_db
  local brand="${TEST_BRAND:-korczewski}"
  ext=$(seed_real_feature "$brand" "tests/fixtures/sf-test-queue-$$-a.txt")
  run env BRAND="$brand" bash scripts/factory/queue.sh
  [ "$status" -eq 0 ]
  echo "$output" | jq -e --arg e "$ext" 'any(.[]; .external_id == $e)'
  # NEGATIV-ANKER: SF-TEST-Fixtures (is_test_data=true) erscheinen NIE in der Queue.
  sfx=$(seed_test_feature "$brand" "tests/fixtures/sf-test-queue-$$-b.txt")
  run env BRAND="$brand" bash scripts/factory/queue.sh
  [ "$status" -eq 0 ]
  if echo "$output" | jq -e --arg e "$sfx" 'any(.[]; .external_id == $e)'; then
    echo "SF-TEST fixture leaked into queue candidates: $sfx" >&2
    return 1
  fi
  purge_real_feature "$brand" "$ext"
}

# ── FA-SF-25-schedule ───────────────────────────────────────────#
# FA-SF-25: schedule.sh emits a launch plan and claims slots.

@test "FA-SF-25: dry-resolve works" {
  run env BRAND=mentolder FACTORY_DRY_RESOLVE=1 bash scripts/factory/schedule.sh
  [ "$status" -eq 0 ]
}

@test "FA-SF-25: two disjoint backlog features both get scheduled with slots" {
  # [T005029] schedule.sh leitet seine Kandidaten aus queue.sh ab — der
  # is_test_data-Filter (T002830) schloss SF-TEST-Fixtures aus, die Tests erwarteten
  # sie trotzdem. Umgestellt auf is_test_data=false-Features (seed_real_feature).
  _skip_if_no_db
  local brand="${TEST_BRAND:-korczewski}"
  e1=$(seed_real_feature "$brand" "tests/fixtures/sf-test-sched-$$-a.txt")
  e2=$(seed_real_feature "$brand" "tests/fixtures/sf-test-sched-$$-b.txt")
  run env BRAND="$brand" FACTORY_GLOBAL_CAP=3 bash scripts/factory/schedule.sh
  [ "$status" -eq 0 ]
  echo "$output" | jq -e --arg e "$e1" 'any(.[]; .external_id == $e and (.slot|type=="number"))'
  echo "$output" | jq -e --arg e "$e2" 'any(.[]; .external_id == $e)'
  purge_real_feature "$brand" "$e1"
  purge_real_feature "$brand" "$e2"
}

@test "FA-SF-25: global cap of 1 schedules at most one feature" {
  # [T005029] Vorher vakuos gruen: SF-TEST-Fixtures sind durch den queue.sh-Filter
  # unsichtbar, die leere Kandidatenliste erfuellt `0 <= 1` trivial. POSITIV-ANKER
  # [T002356-M1]: mindestens ein is_test_data=false-Feature muss kandidieren.
  _skip_if_no_db
  local brand="${TEST_BRAND:-korczewski}"
  r1=$(seed_real_feature "$brand" "tests/fixtures/sf-test-cap-$$-a.txt")
  r2=$(seed_real_feature "$brand" "tests/fixtures/sf-test-cap-$$-b.txt")
  run env BRAND="$brand" FACTORY_GLOBAL_CAP=1 bash scripts/factory/schedule.sh
  [ "$status" -eq 0 ]
  count=$(echo "$output" | jq 'length')
  [ "$count" -ge 1 ]
  [ "$count" -le 1 ]
  purge_real_feature "$brand" "$r1"
  purge_real_feature "$brand" "$r2"
}

# ── FA-SF-26-watchdog ───────────────────────────────────────────#
# FA-SF-26: watchdog escalates stale in_progress features.

@test "FA-SF-26: dry-resolve works" {
  run env BRAND=mentolder FACTORY_DRY_RESOLVE=1 bash scripts/factory/watchdog.sh
  [ "$status" -eq 0 ]
}

@test "FA-SF-26: a stale in_progress feature is returned to triage and its slot freed" {
  _skip_if_no_db
  local brand="${TEST_BRAND:-korczewski}"
  ext=$(seed_test_feature "$brand" "tests/fixtures/sf-test-wd-$$-a.txt")
  # Zustand direkt setzen statt `slots.sh claim`: dessen Subkommando schreibt
  # pipeline_slot_meta, eine Spalte, die in prod fehlt (T002619) — der Claim
  # scheiterte dort mit Exit 3, bevor der Test begann.
  # [T002689] Beide Brands liegen in derselben SDLC-Datenbank; die Brand ist ein
  # Zeilenfilter, kein Namespace. seed_test_feature schreibt entsprechend nach
  # `workspace` — eine brand-abhaengige Ableitung suchte hier ins Leere.
  local ns="${FACTORY_NS:-workspace}"
  pod=$(kubectl get pod -n "$ns" --context "$FACTORY_CTX" -l 'app in (shared-db, shared-db-dev)' --field-selector status.phase=Running -o name | head -1)
  kubectl exec -i "$pod" -n "$ns" --context "$FACTORY_CTX" -c postgres -- \
    psql -U website -d website -qtAc "UPDATE tickets.tickets SET pipeline_slot=1, status='in_progress' WHERE external_id='$ext';"
  # Alterung ueber den Schwellwert statt ueber den Zeitstempel [T002620]:
  # fn_lifecycle_ts ueberschreibt `updated_at := now()` bei JEDEM Update, ein
  # Backdating bliebe wirkungslos und die Stale-Liste leer — dann liefe der
  # Watchdog ohne Arbeit durch und der Test bestuende vakuos. ORPHAN_MIN=999
  # blendet den Waisen-Sweep aus (Isolation, Spiegel von orphan-slot-reap.bats).
  # [T005029] BATS 1.x merged stderr in $output; eine Redirection wie
  # `run … 2>/dev/null` wirkt dort NICHT: sie liegt auf dem run-Aufruf, waehrend
  # BATS intern `output="$( { "$@"; } 2>&1 )"` erfasst und das `2>&1` die
  # Redirection ueberschreibt. Der Watchdog schreibt bei Tickets ohne phase
  # events INFRA-/Counter-Warnungen auf stderr (T002361/T002389) — sie landen
  # also im $output. Output-Vertrag des Skripts: `echo "$escalated"` ist die
  # letzte Ausgabe, alle Warnungen stehen davor — die letzte Zeile ist
  # deterministisch das JSON-Array.
  run env BRAND="$brand" FACTORY_STALE_MIN=0 FACTORY_ORPHAN_SLOT_MIN=999 \
    bash scripts/factory/watchdog.sh
  [ "$status" -eq 0 ]
  # POSITIV-ANKER [T002356-M1]: belegt, dass die Stale-Liste NICHT leer war.
  local escalated_json="$(printf '%s\n' "$output" | tail -n 1)"
  echo "$escalated_json" | jq -e --arg e "$ext" 'any(.[]; . == $e)'
  # Confirm status=triage and pipeline_slot cleared.
  st=$(BRAND="$brand" TICKET_CTX="$FACTORY_CTX" bash scripts/ticket.sh get --id "$ext" | jq -r '.status')
  [ "$st" = "triage" ]
  # Slot-Freigabe nachpruefen — nicht nur den Status (der Testtitel verspricht beides).
  slot=$(kubectl exec -i "$pod" -n "$ns" --context "$FACTORY_CTX" -c postgres -- \
    psql -U website -d website -qtAc "SELECT COALESCE(pipeline_slot::text,'NULL') FROM tickets.tickets WHERE external_id='$ext';")
  [ "$slot" = "NULL" ]
}

@test "FA-SF-26: a stale in_progress feature WITH a staged plan (FACTORY-PLAN-REF) is returned to backlog, not triage [T001850]" {
  # [T002427] Aus tests/local/FA-SF-26-watchdog.bats uebernommen. Gegenstueck zum Test
  # darueber: liegt bereits ein Plan vor, darf der Watchdog diese Arbeit nicht wegwerfen,
  # indem er nach triage zuruecksetzt — das erzwingt einen vollen Scout/Design/Plan-Neustart.
  _skip_if_no_db
  local brand="${TEST_BRAND:-korczewski}"
  ext=$(seed_test_feature "$brand" "tests/fixtures/sf-test-wd-$$-b.txt")
  # Zustand direkt setzen statt `slots.sh claim` (T002619) — siehe Test oben.
  # [T002689] Beide Brands liegen in derselben SDLC-Datenbank; die Brand ist ein
  # Zeilenfilter, kein Namespace. seed_test_feature schreibt entsprechend nach
  # `workspace` — eine brand-abhaengige Ableitung suchte hier ins Leere.
  local ns="${FACTORY_NS:-workspace}"
  pod=$(kubectl get pod -n "$ns" --context "$FACTORY_CTX" -l 'app in (shared-db, shared-db-dev)' --field-selector status.phase=Running -o name | head -1)
  kubectl exec -i "$pod" -n "$ns" --context "$FACTORY_CTX" -c postgres -- \
    psql -U website -d website -qtAc "UPDATE tickets.tickets SET pipeline_slot=1, status='in_progress' WHERE external_id='$ext';"
  # Simuliert, dass dev-flow-plan fuer dieses Ticket bereits einen Plan gestaged hat.
  BRAND="$brand" TICKET_CTX="$FACTORY_CTX" bash scripts/ticket.sh add-comment --id "$ext" \
    --body "FACTORY-PLAN-REF branch=feature/sf-test-wd-$$ plan=openspec/changes/sf-test-wd-$$/tasks.md" >/dev/null
  # Schwellwert 0 statt Zurueckdatieren [T002620] — siehe Test oben.
  # [T005029] Kein `2>/dev/null` am run-Aufruf: BATS 1.x merged stderr in
  # $output und ueberschreibt die Redirection mit seinem internen `2>&1` —
  # siehe Kommentar im Watchdog-Test darueber. Die letzte Zeile ist das JSON.
  run env BRAND="$brand" FACTORY_STALE_MIN=0 FACTORY_ORPHAN_SLOT_MIN=999 \
    bash scripts/factory/watchdog.sh
  [ "$status" -eq 0 ]
  # POSITIV-ANKER [T002356-M1]: belegt, dass die Stale-Liste NICHT leer war.
  local escalated_json="$(printf '%s\n' "$output" | tail -n 1)"
  echo "$escalated_json" | jq -e --arg e "$ext" 'any(.[]; . == $e)'
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
  _skip_if_no_db
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
