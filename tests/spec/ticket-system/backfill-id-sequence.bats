#!/usr/bin/env bats
# tests/spec/ticket-system/backfill-id-sequence.bats
# SSOT: openspec/changes/backfill-id-sequence/specs/ticket-system.md (T002732)
#
# PRUEFMODUS (T002448-M4): Output-Verifikation. Die Verhaltenstests fuehren
# `scripts/ticket.sh backfill-id` AUS und pruefen $status und $output. Der erste
# Test ist die dokumentierte Ausnahme — er gleicht zwei Repo-Artefakte
# gegeneinander ab (Skript-Referenzen vs. Schema-Migration), ein Zustand, der
# sich ausschliesslich im Quelltext manifestiert und offline pruefbar sein soll.
#
# Run: tests/unit/lib/bats-core/bin/bats tests/spec/ticket-system/backfill-id-sequence.bats
# or:  task test:unit SPEC=ticket-system/backfill-id-sequence

setup() {
  REPO_ROOT="${REPO_ROOT:-$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)}"
  TICKET_SCRIPTS="${REPO_ROOT}/scripts/vda/ticket"
  MIGRATIONS="${REPO_ROOT}/website/src/lib/tickets/migrations.ts"
  CTX="k3d-mentolder-dev"
  NS="workspace"
  TESTROW_TITLE="T002732 backfill-id testrow"
}

teardown() {
  # Sicherheitsnetz: raeumt die praeparierte Zeile auch dann ab, wenn der Test
  # vorher fehlschlaegt. Ueber den Titel statt der UUID, weil BATS-Variablen den
  # Test nicht ueberleben.
  if cluster_running; then
    local pod
    pod="$(pgpod)" || return 0
    [ -n "$pod" ] || return 0
    kubectl exec -i "$pod" -n "$NS" --context "$CTX" -c postgres -- \
      psql -U website -d website -qtA \
      -c "DELETE FROM tickets.tickets WHERE title = '${TESTROW_TITLE}';" >/dev/null 2>&1 || true
  fi
}

cluster_running() {
  kubectl --context "$CTX" get nodes >/dev/null 2>&1
}

pgpod() {
  kubectl get pod -n "$NS" --context "$CTX" -l 'app in (shared-db, shared-db-dev)' \
    --field-selector status.phase=Running -o name 2>/dev/null | head -1
}

psql_q() {
  local pod
  pod="$(pgpod)"
  [ -n "$pod" ] || return 1
  kubectl exec -i "$pod" -n "$NS" --context "$CTX" -c postgres -- \
    psql -U website -d website -qtA -v ON_ERROR_STOP=1 -c "$1"
}

# ── Ebene 1: Konsistenz Skript ↔ Schema-Migration (offline, laeuft in CI) ─────

@test "T002732: every nextval('tickets.*') in ticket scripts is created by migrations.ts" {
  [ -f "$MIGRATIONS" ]

  # Alle referenzierten Sequenznamen einsammeln.
  local refs
  refs="$(grep -rhoE "nextval\('tickets\.[a-z_]+'\)" "$TICKET_SCRIPTS" 2>/dev/null \
    | sed -E "s/nextval\('tickets\.([a-z_]+)'\)/\1/" | sort -u)"

  # POSITIV-ANKER (T002356-M1): Ohne diesen Check waere der Test vakuos — faende
  # das grep nichts, liefe die Schleife unten leer durch und der Test gruente,
  # egal wie kaputt die Referenzen sind.
  [ -n "$refs" ]
  [ "$(printf '%s\n' "$refs" | grep -c .)" -ge 1 ]

  # Zweiter Positiv-Anker: die kanonische Sequenz MUSS in der Migration stehen.
  # Faellt dieser Check, ist der Vergleich unten wertlos statt aussagekraeftig.
  grep -qE "CREATE SEQUENCE IF NOT EXISTS tickets\.external_id_seq" "$MIGRATIONS"

  local seq missing=""
  while IFS= read -r seq; do
    [ -n "$seq" ] || continue
    if ! grep -qE "CREATE SEQUENCE( IF NOT EXISTS)? tickets\.${seq}\b" "$MIGRATIONS"; then
      missing="${missing} ${seq}"
    fi
  done <<< "$refs"

  if [ -n "$missing" ]; then
    echo "Sequenzen referenziert, aber nicht in migrations.ts angelegt:${missing}" >&2
    echo "Fundstellen:" >&2
    grep -rnE "nextval\('tickets\.[a-z_]+'\)" "$TICKET_SCRIPTS" >&2
    return 1
  fi
}

# ── Ebene 2: Verhalten gegen den lebenden lokalen Cluster ────────────────────

@test "T002732: backfill-id assigns an external_id to a row that lacks one" {
  if ! cluster_running; then skip "cluster ${CTX} not reachable"; fi

  # Praeparieren: regulaer einfuegen (BEFORE-INSERT-Trigger vergibt eine ID),
  # danach per UPDATE auf NULL setzen. Der Trigger feuert ausschliesslich auf
  # INSERT, das UPDATE laeuft also an ihm vorbei — kein DISABLE TRIGGER und
  # keine erhoehten Rechte noetig.
  local uuid
  uuid="$(psql_q "INSERT INTO tickets.tickets (type, brand, title) \
    VALUES ('task', 'mentolder', '${TESTROW_TITLE}') RETURNING id;")"
  [ -n "$uuid" ]

  psql_q "UPDATE tickets.tickets SET external_id = NULL WHERE id = '${uuid}';"

  local before
  before="$(psql_q "SELECT count(*) FROM tickets.tickets WHERE external_id IS NULL;")"
  [ "$before" -ge 1 ]

  run bash "${REPO_ROOT}/scripts/ticket.sh" backfill-id --brand mentolder
  [ "$status" -eq 0 ]

  # POSITIV-ANKER: die tatsaechlich vergebene ID, nicht bloss "kein Fehler".
  local assigned
  assigned="$(psql_q "SELECT coalesce(external_id, '') FROM tickets.tickets WHERE id = '${uuid}';")"
  [[ "$assigned" =~ ^T[0-9]{6}$ ]]

  # Und sie muss aus external_id_seq stammen, also <= dem aktuellen Stand liegen.
  local seqval assigned_num
  seqval="$(psql_q "SELECT last_value FROM tickets.external_id_seq;")"
  assigned_num="$((10#${assigned#T}))"
  [ "$assigned_num" -le "$seqval" ]

  psql_q "DELETE FROM tickets.tickets WHERE id = '${uuid}';"
}

@test "T002732: backfill-id reports the number of rows it updated" {
  if ! cluster_running; then skip "cluster ${CTX} not reachable"; fi

  local uuid
  uuid="$(psql_q "INSERT INTO tickets.tickets (type, brand, title) \
    VALUES ('task', 'mentolder', '${TESTROW_TITLE}') RETURNING id;")"
  [ -n "$uuid" ]
  psql_q "UPDATE tickets.tickets SET external_id = NULL WHERE id = '${uuid}';"

  run bash "${REPO_ROOT}/scripts/ticket.sh" backfill-id --brand mentolder
  [ "$status" -eq 0 ]

  # Auf den Zeilenanfang verankert, damit der Worktree-Pfad im Usage-Text
  # (enthaelt "backfill-id-sequence") die Zusicherung nicht erfuellen kann.
  [ "$(printf '%s\n' "$output" | grep -cE '^backfill-id: [0-9]+ Zeile')" -ge 1 ]

  psql_q "DELETE FROM tickets.tickets WHERE id = '${uuid}';"
}

@test "T002732: an empty backfill-id run says so instead of staying silent" {
  if ! cluster_running; then skip "cluster ${CTX} not reachable"; fi

  local remaining
  remaining="$(psql_q "SELECT count(*) FROM tickets.tickets WHERE external_id IS NULL;")"
  if [ "$remaining" -ne 0 ]; then
    skip "genuine rows without external_id present (${remaining}) — not this test's subject"
  fi

  run bash "${REPO_ROOT}/scripts/ticket.sh" backfill-id --brand mentolder
  [ "$status" -eq 0 ]
  [ "$(printf '%s\n' "$output" | grep -cE '^backfill-id: 0 Zeilen ohne external_id')" -ge 1 ]
}
