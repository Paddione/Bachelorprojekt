#!/usr/bin/env bats
# tests/spec/factory-watchdog/merged-ticket-close.bats
#
# [T006297] Merged-PR-Dispatch-Gate (Watchdog-Seite): Ein in_progress-Ticket,
# dessen PR bereits auf main gemergt ist, darf vom Watchdog-Stale-Sweep NICHT
# in die Queue zurueckgesetzt werden — der Reset re-dispatcht die fertige
# Arbeit in ein frisches Worktree (Duplikat-Arbeit, beobachtet als
# "Factory-Watchdog-Sturm": PRs #4512/#4514/#4515 gemergt, Tickets blieben
# offen, der Watchdog schrieb alle ~5s "pipeline stale"-Kommentare und
# re-dispatchte T004896/T005565/T005591). Stattdessen wird das Ticket
# geschlossen (done, Resolution nach Typ: fix/bug → fixed) und der
# Attempt-Zaehler (factory_control, T002389) wird NICHT erhoeht.
#
# PRUEFMODUS: Output-/Resultat-Verifikation (T002448-M4) gegen die Live-Dev-DB.
# Fixtures werden per SQL-INSERT angelegt — Backdating von updated_at ist nur
# im INSERT-Zweig moeglich, weil fn_lifecycle_ts es bei JEDEM UPDATE
# unueberschreibbar auf now() setzt (T002620). Der Watchdog wird AUSGEFUEHRT;
# geprueft werden die tatsaechlichen Resultate: Status/Resolution via
# ticket.sh get, Close-Kommentar + factory_control via SQL. Kein Source-Grep.
#
# Isolation [T005561]: STALE_MIN=30 statt 0 — die Schwellwert-Alterung kommt
# aus dem zurueckdatierten INSERT-Zeitstempel (40min alt), nicht aus dem
# Grenzwert. Das kollidiert nicht mit den harten 0-min-Laeufen der
# Bestandsguards und laesst frische Seeds paralleler Laeufe (< 30min alt)
# unberuehrt. FACTORY_STALE_EXCLUDE_TEST_SEEDS=1 isoliert zusaetzlich gegen
# SF-TEST-Ghost-Seeds; die Orphan-Sweeps sind per 999-Min-Schwellen
# ausgeblendet (Spiegel von stale-type-coverage.bats / FA-SF-26).
#
# Fixtures (brand=mentolder, is_test_data=false, Titel SF-REAL-* fuer den
# purge_real_feature-Titel-Guard; Registrierung in sf-seeded-ids fuer
# _sf_teardown):
#   T001105 — PR #2081 auf main gemergt, Zeile in der Dev-DB geloescht
#             (external_id UNIQUE global, T006297-Fixture nutzt eine
#             merged-und-geloeschte ID). type=fix, in_progress, 40min alt
#             → STALE. Mit Fix: done/fixed + Close-Kommentar, kein Zaehler.
#             Ohne Fix (RED): Reset nach triage.
#   T099999 — nie gemergt (nicht auf main). type=feature, in_progress, 40min
#             alt → STALE. Positiv-Anker [T002356-M1]: wird in BEIDEN Faellen
#             von der Stale-Sweep verarbeitet (→ triage, in der escalated-JSON)
#             und belegt, dass die Sweep meine Fixtures erreicht und die
#             Kandidatenliste nicht leer war.

setup_file() {
  export TICKET_TEST_DB_OK=1
}

setup() {
  load '../software-factory/_sf_common.bash'
  _sf_setup
  _skip_if_no_db
  export TEST_BRAND=mentolder
}

teardown() {
  # factory_control traegt KEINE FK-Kaskade zur tickets-Zeile — der
  # Reset-Pfad des RED-Laufs hinterlaesst Zaehler-Zeilen, die der Ticket-Purge
  # nicht mitnimmt. Explizit aufraeumen; nie den Exit-Code verfaelschen.
  local pod
  pod=$(kubectl get pod -n "${FACTORY_NS:-workspace}" --context "${FACTORY_CTX:-k3d-mentolder-dev}" \
    -l 'app in (shared-db, shared-db-dev)' --field-selector status.phase=Running -o name 2>/dev/null | head -1) || true
  if [[ -n "$pod" ]]; then
    kubectl exec -i "$pod" -n "${FACTORY_NS:-workspace}" --context "${FACTORY_CTX:-k3d-mentolder-dev}" -c postgres -- \
      psql -U postgres -d website -qtAc "DELETE FROM tickets.factory_control WHERE key IN ('factory_attempt:T001105','factory_infra_attempt:T001105','factory_attempt:T099999','factory_infra_attempt:T099999');" \
      >/dev/null 2>&1 < /dev/null || true
  fi
  _sf_teardown
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

# _seed_stale_fixture <external_id> <type> — in_progress-Zeile, 40min alt
# (updated_at zurueckdatiert, INSERT umgeht fn_lifecycle_ts), Slot belegt.
_seed_stale_fixture() {
  local ext="$1" type="$2"
  _fixture_psql "INSERT INTO tickets.tickets (external_id, brand, type, title, status, is_test_data, pipeline_slot, created_at, updated_at) VALUES ('${ext}', 'mentolder', '${type}', 'SF-REAL-merged-wd-${ext}', 'in_progress', false, 1, now() - interval '3 hours', now() - interval '40 minutes') ON CONFLICT (external_id) DO NOTHING;" >/dev/null
  # Positiv-Anker-Fuellung: die Zeile MUSS stehen (ON CONFLICT deckt nur einen
  # unerwarteten Altbestand ab — fehlt die Zeile, ist der Test vakuos).
  local exists
  exists=$(_fixture_psql "SELECT count(*) FROM tickets.tickets WHERE external_id='${ext}';" | tr -d '[:space:]')
  [ "$exists" = "1" ]
  echo "$ext" >> "$BATS_FILE_TMPDIR/sf-seeded-ids"
}

@test "T006297: watchdog closes a merged ticket (done/fixed, counter untouched) instead of resetting it" {
  _seed_stale_fixture T099999 feature   # Positiv-Anker: nie gemergt
  _seed_stale_fixture T001105 fix       # gemergt (PR #2081)

  run env BRAND=mentolder FACTORY_STALE_MIN=30 FACTORY_STALE_EXCLUDE_TEST_SEEDS=1 \
    FACTORY_ORPHAN_SLOT_MIN=999 FACTORY_ORPHAN_TICKET_MIN=999 \
    bash scripts/factory/watchdog.sh
  [ "$status" -eq 0 ]

  # ── Positiv-Anker [T002356-M1] zuerst: die Stale-Sweep hat meine Fixtures
  # verarbeitet — der Anker steht in der escalated-JSON und wurde nach triage
  # zurueckgesetzt. Ohne diese Aussage waere die Negativ-Aussage vakuos.
  local escalated_json
  escalated_json="$(printf '%s\n' "$output" | tail -n 1)"
  echo "$escalated_json" | jq -e --arg e T099999 'any(.[]; . == $e)'
  local st
  st=$(BRAND=mentolder TICKET_CTX="$FACTORY_CTX" bash scripts/ticket.sh get --id T099999 | jq -r '.status')
  [ "$st" = "triage" ]

  # ── Negativ-Aussage: gemergt → NICHT reset, sondern geschlossen.
  st=$(BRAND=mentolder TICKET_CTX="$FACTORY_CTX" bash scripts/ticket.sh get --id T001105 | jq -r '.status')
  [ "$st" = "done" ]
  local res
  res=$(BRAND=mentolder TICKET_CTX="$FACTORY_CTX" bash scripts/ticket.sh get --id T001105 | jq -r '.resolution')
  [ "$res" = "fixed" ]

  # Close-Kommentar sichtbar (Semantik-Probe: "gemergt"-Vermerk, kein
  # Darstellungs-Anker [T002716]).
  local n_comment
  n_comment=$(_fixture_psql "SELECT count(*) FROM tickets.ticket_comments c JOIN tickets.tickets t ON t.id = c.ticket_id WHERE t.external_id='T001105' AND c.body LIKE '%gemergt%';" | tr -d '[:space:]')
  [ "$n_comment" = "1" ]

  # Attempt-Zaehler NICHT erhoeht: keine factory_control-Zeile fuer das
  # gemergte Ticket (der Reset-Pfad haette eine INFRA-Zeile geschrieben).
  local n_ctrl
  n_ctrl=$(_fixture_psql "SELECT count(*) FROM tickets.factory_control WHERE key IN ('factory_attempt:T001105','factory_infra_attempt:T001105');" | tr -d '[:space:]')
  [ "$n_ctrl" = "0" ]
}
