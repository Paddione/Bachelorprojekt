#!/usr/bin/env bats
# tests/spec/software-factory/merged-dispatch-gate.bats
#
# [T006297] Merged-PR-Dispatch-Gate (Schedule-Seite): Ein plan_staged-Ticket,
# dessen PR bereits auf main gemergt ist, darf von schedule.sh NICHT in ein
# frisches Worktree dispatched werden — der Dispatch von gemergter Arbeit ist
# Duplikat-Arbeit (beobachtet als "Factory-Watchdog-Sturm": PRs
# #4512/#4514/#4515 gemergt, Tickets blieben offen, Queue+Schedule
# re-dispatchten T004896/T005565/T005591 in neue Worktrees). Stattdessen wird
# das Ticket geschlossen (done, Resolution nach Typ: fix/bug → fixed), mit
# einem "gemergt"-Vermerk kommentiert und erscheint NICHT im Launch-Plan.
#
# PRUEFMODUS: Output-/Resultat-Verifikation (T002448-M4) gegen die Live-Dev-DB.
# Das gemergte Fixture wird per SQL-INSERT angelegt (external_id UNIQUE
# global; T001108 = PR #2083, auf main gemergt, Zeile in der Dev-DB geloescht —
# der echte Storm-Zustand ist als Fixture nicht nachbildbar, weil T004896 etc.
# in der DB existieren). Der Positiv-Anker kommt aus seed_real_feature
# (is_test_data=false, Lastenheft-locked, touched_files gesetzt). schedule.sh
# wird AUSGEFUEHRT; geprueft werden der Launch-Plan (jq-Semantik),
# Status/Resolution via ticket.sh get und der Close-Kommentar via SQL.
# Kein Source-Grep.
#
# Isolation: FACTORY_GLOBAL_CAP=3 + Skip-Guard gegen belegte Slot-Pools
# beider Brands (Parallelitaet mit scheduling.bats). Der Anker wird pro Lauf
# frisch geseedet und von _sf_teardown gepurged.

setup_file() {
  export TICKET_TEST_DB_OK=1
}

setup() {
  load '_sf_common.bash'
  _sf_setup
  _skip_if_no_db
  _skip_if_pool_busy
  export TEST_BRAND=mentolder
  source "${REPO_ROOT}/tests/lib/factory-test-fixtures.sh"
}

teardown() {
  # [T005309] Registrierte Seeds purgen (auch nach fehlgeschlagener Assertion)
  # — ohne teardown-Wrapper liefe _sf_teardown nie und der RED-Lauf hinterliesse
  # einen Ghost-Seed in_progress.
  _sf_teardown
}

# _skip_if_pool_busy — schedule.sh claims Slots; unzureichende freie
# Kapazitaet (eigener Bedarf + GLOBAL_CAP) wuerde den Anker-Claim scheitern
# lassen und den Test flakig machen. Bedarf: 2 Claims (Anker + gemergtes
# Fixture im RED-Lauf; GREEN braucht nur 1, der Guard rechnet konservativ
# mit 2). slots.sh count = gang-aware SUM(slot_count) ueber
# pipeline_slot IS NOT NULL AND status='in_progress' (nur belegte Slots
# zaehlen; ein besetzter Pool mit freien Restplaetzen ist KEIN Grund zum
# Skip — "busy > 0" waere zu streng).
#
# Skip bleibt Skip (Schutz des Live-Dev-DB-Modus); Flakiness ist durch die
# beiden Schritte (Gate hoisten + Fixture härten) beseitigt, nicht durch
# einen harten Fehler.
_skip_if_pool_busy() {
  local need=2 used b global_used free
  used=$(env BRAND=mentolder FACTORY_CTX="${FACTORY_CTX:-k3d-mentolder-dev}" bash scripts/factory/slots.sh count 2>/dev/null) || used=0
  [[ "$used" =~ ^[0-9]+$ ]] || used=0
  global_used="$used"
  free=$(( ${FACTORY_SLOTS_PER_BRAND:-3} - used ))
  for b in korczewski; do
    used=$(env BRAND="$b" FACTORY_CTX="${FACTORY_CTX:-k3d-mentolder-dev}" bash scripts/factory/slots.sh count 2>/dev/null) || used=0
    [[ "$used" =~ ^[0-9]+$ ]] || used=0
    global_used=$((global_used + used))
  done
  if [[ "$free" -lt "$need" ]]; then
    skip "mentolder slot pool: free=$free < needed=$need"
  fi
  if [[ $((global_used + need)) -gt "${FACTORY_GLOBAL_CAP:-3}" ]]; then
    skip "global capacity: used=$global_used + needed=$need > FACTORY_GLOBAL_CAP"
  fi
}

# _fixture_psql <sql> — psql gegen die SDLC-Dev-DB (gleiche Konvention wie
# purge_real_feature: -U postgres -d website, < /dev/null gegen Stdin-Drain).
_fixture_psql() {
  local pod
  pod=$(kubectl get pod -n "${FACTORY_NS:-workspace}" --context "${FACTORY_CTX:-k3d-mentolder-dev}" \
    -l 'app in (shared-db, shared-db-dev)' --field-selector status.phase=Running -o name 2>/dev/null | head -1) || true
  [[ -n "$pod" ]] || return 1
  kubectl exec -i "$pod" -n "${FACTORY_NS:-workspace}" --context "${FACTORY_CTX:-k3d-mentolder-dev}" -c postgres -- \
    psql -U postgres -d website -qtAc "$1" < /dev/null
}

@test "T006297: schedule closes a merged plan_staged ticket instead of dispatching it" {
  local brand=mentolder

  # ── Positiv-Anker [T002356-M1] zuerst: ein echter (nie gemergter)
  # Backlog-Feature MUSS dispatched werden — belegt, dass Queue+Schedule meine
  # Fixtures erreichen und der Launch-Plan nicht leer ist.
  local anchor
  anchor=$(seed_real_feature "$brand" "tests/fixtures/sf-test-mgd-$$.txt")

  # ── Gemergtes Fixture (PR #2083): plan_staged + execution_released=true
  # (Staged-Lane von queue.sh, is_test_data=false).
  _fixture_psql "INSERT INTO tickets.tickets (external_id, brand, type, title, status, readiness, is_test_data, created_at) VALUES ('T001108', 'mentolder', 'fix', 'SF-REAL-merged-sched-T001108', 'plan_staged', '{\"execution_released\": true}'::jsonb, false, now() - interval '30 days') ON CONFLICT (external_id) DO NOTHING;" >/dev/null
  local exists
  exists=$(_fixture_psql "SELECT count(*) FROM tickets.tickets WHERE external_id='T001108';" | tr -d '[:space:]')
  [ "$exists" = "1" ]
  echo "T001108" >> "$BATS_FILE_TMPDIR/sf-seeded-ids"

  run env BRAND="$brand" FACTORY_GLOBAL_CAP=3 bash scripts/factory/schedule.sh
  [ "$status" -eq 0 ]

  # Launch-Plan = letzte Ausgabezeile (WARN-Zeilen laufen bei BATS 1.x in
  # $output, siehe FA-SF-26 [T005029]).
  local plan_json
  plan_json="$(printf '%s\n' "$output" | tail -n 1)"

  # ── Positiv-Anker: der Anker ist im Plan und hat einen Slot belegt.
  echo "$plan_json" | jq -e --arg e "$anchor" 'any(.[]; .external_id == $e and (.slot|type=="number"))'
  local st
  st=$(BRAND="$brand" TICKET_CTX="$FACTORY_CTX" bash scripts/ticket.sh get --id "$anchor" | jq -r '.status')
  [ "$st" = "in_progress" ]

  # ── Negativ-Aussagen: das gemergte Ticket ist NICHT im Launch-Plan,
  # sondern geschlossen (done, Resolution fixed) — ohne Fix (RED) waere es
  # geclaimt und stuende im Plan.
  echo "$plan_json" | jq -e --arg e T001108 'all(.[]; .external_id != $e)'
  st=$(BRAND="$brand" TICKET_CTX="$FACTORY_CTX" bash scripts/ticket.sh get --id T001108 | jq -r '.status')
  [ "$st" = "done" ]
  local res
  res=$(BRAND="$brand" TICKET_CTX="$FACTORY_CTX" bash scripts/ticket.sh get --id T001108 | jq -r '.resolution')
  [ "$res" = "fixed" ]

  # Close-Kommentar sichtbar (Semantik-Probe: "gemergt"-Vermerk [T002716]).
  local n_comment
  n_comment=$(_fixture_psql "SELECT count(*) FROM tickets.ticket_comments c JOIN tickets.tickets t ON t.id = c.ticket_id WHERE t.external_id='T001108' AND c.body LIKE '%gemergt%';" | tr -d '[:space:]')
  [ "$n_comment" = "1" ]
}
