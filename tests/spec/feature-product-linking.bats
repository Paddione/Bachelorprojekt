#!/usr/bin/env bats
# T002016 — feature-product-linking. Covers:
#   1. scripts/one-shot/2026-07-21-feature-product-backfill.mjs (DB-backed,
#      skipped without TRACKING_DB_URL — analogous to
#      tests/unit/tickets-projects-migration.bats).
#   2. scripts/vda/ticket/create.sh --product-id (offline, kubectl mocked —
#      analogous to tests/unit/ticket-create.bats).

load ../unit/test_helper

PSQL="psql -X -A -t -v ON_ERROR_STOP=1"
SCRIPT="$BATS_TEST_DIRNAME/../../scripts/one-shot/2026-07-21-feature-product-backfill.mjs"

# Fixture UUIDs — deterministic so teardown can remove them without touching
# any real data.
FIX_BRAND="mentolder"
FIX_FEATURE_ID="T900901"
FIX_MAPPING_DIR=""

# DB-backed tests call this first (not a global setup(), so the offline
# create.sh tests below don't require TRACKING_DB_URL at all).
_require_db() {
  if [[ "${TRACKING_DB_URL:-}" == "" ]]; then
    skip "TRACKING_DB_URL not set"
  fi
  if [[ "${TRACKING_DB_URL}" == *"web.mentolder.de"* || "${TRACKING_DB_URL}" == *"web.korczewski.de"* ]]; then
    skip "refusing to run against prod URL"
  fi
  FIX_MAPPING_DIR="$(mktemp -d)"
  cat > "$FIX_MAPPING_DIR/mapping.json" <<EOF
[{"external_id": "$FIX_FEATURE_ID", "brand": "$FIX_BRAND", "product_slug": "website", "confidence": 0.9}]
EOF
  $PSQL "$TRACKING_DB_URL" -c \
    "INSERT INTO tickets.tickets (external_id, type, brand, title, description, status)
     VALUES ('$FIX_FEATURE_ID', 'feature', '$FIX_BRAND', 'BATS fixture feature', 'desc', 'triage')
     ON CONFLICT (external_id) DO NOTHING" >/dev/null
}

teardown() {
  [[ -z "${TRACKING_DB_URL:-}" ]] && return 0
  [[ -n "$FIX_MAPPING_DIR" ]] && rm -rf "$FIX_MAPPING_DIR"
  $PSQL "$TRACKING_DB_URL" -c \
    "DELETE FROM tickets.tickets WHERE external_id = '$FIX_FEATURE_ID'" >/dev/null 2>&1 || true
  $PSQL "$TRACKING_DB_URL" -c \
    "DELETE FROM tickets.tickets WHERE type='project' AND brand='$FIX_BRAND' AND title='Website'
       AND NOT EXISTS (SELECT 1 FROM tickets.tickets f WHERE f.parent_id = tickets.tickets.id AND f.external_id <> '$FIX_FEATURE_ID')" >/dev/null 2>&1 || true
}

@test "backfill: dry-run does not write" {
  _require_db
  local before
  before=$($PSQL "$TRACKING_DB_URL" -c "SELECT parent_id FROM tickets.tickets WHERE external_id='$FIX_FEATURE_ID'")
  BACKFILL_MAPPING_FILE="$FIX_MAPPING_DIR/mapping.json" TRACKING_DB_URL="$TRACKING_DB_URL" node "$SCRIPT" >/dev/null
  local after
  after=$($PSQL "$TRACKING_DB_URL" -c "SELECT parent_id FROM tickets.tickets WHERE external_id='$FIX_FEATURE_ID'")
  [ "$before" = "$after" ]
}

@test "backfill: --apply links the fixture feature to a type=project ticket in the same brand" {
  _require_db
  BACKFILL_MAPPING_FILE="$FIX_MAPPING_DIR/mapping.json" TRACKING_DB_URL="$TRACKING_DB_URL" node "$SCRIPT" --apply >/dev/null
  run $PSQL "$TRACKING_DB_URL" -c \
    "SELECT p.type, p.brand FROM tickets.tickets f
       JOIN tickets.tickets p ON p.id = f.parent_id
      WHERE f.external_id = '$FIX_FEATURE_ID'"
  [ "$status" -eq 0 ]
  [[ "$output" == *"project"* ]]
  [[ "$output" == *"$FIX_BRAND"* ]]
}

@test "backfill: second --apply run is a no-op (idempotent)" {
  _require_db
  BACKFILL_MAPPING_FILE="$FIX_MAPPING_DIR/mapping.json" TRACKING_DB_URL="$TRACKING_DB_URL" node "$SCRIPT" --apply >/dev/null
  local parent_after_first
  parent_after_first=$($PSQL "$TRACKING_DB_URL" -c "SELECT parent_id FROM tickets.tickets WHERE external_id='$FIX_FEATURE_ID'")

  run bash -c "BACKFILL_MAPPING_FILE='$FIX_MAPPING_DIR/mapping.json' TRACKING_DB_URL='$TRACKING_DB_URL' node '$SCRIPT' --apply"
  [ "$status" -eq 0 ]
  [[ "$output" == *'"featuresLinked":0'* ]] || { echo "second run should link 0 features: $output"; return 1; }

  local parent_after_second
  parent_after_second=$($PSQL "$TRACKING_DB_URL" -c "SELECT parent_id FROM tickets.tickets WHERE external_id='$FIX_FEATURE_ID'")
  [ "$parent_after_first" = "$parent_after_second" ]
}

@test "backfill: already-linked features are never overwritten" {
  _require_db
  # Pre-link the fixture to some other ticket, then run backfill — parent_id
  # must stay untouched even though the mapping file points elsewhere.
  local other_id
  other_id=$($PSQL "$TRACKING_DB_URL" -c \
    "INSERT INTO tickets.tickets (type, brand, title, status) VALUES ('project', '$FIX_BRAND', 'BATS pre-existing parent', 'in_progress') RETURNING id" | head -1)
  $PSQL "$TRACKING_DB_URL" -c \
    "UPDATE tickets.tickets SET parent_id = '$other_id' WHERE external_id = '$FIX_FEATURE_ID'" >/dev/null

  BACKFILL_MAPPING_FILE="$FIX_MAPPING_DIR/mapping.json" TRACKING_DB_URL="$TRACKING_DB_URL" node "$SCRIPT" --apply >/dev/null

  run $PSQL "$TRACKING_DB_URL" -c "SELECT parent_id FROM tickets.tickets WHERE external_id='$FIX_FEATURE_ID'"
  [ "$status" -eq 0 ]
  [[ "$output" == *"$other_id"* ]]

  $PSQL "$TRACKING_DB_URL" -c "DELETE FROM tickets.tickets WHERE id = '$other_id'" >/dev/null 2>&1 || true
}

# ── Offline: scripts/vda/ticket/create.sh --product-id (kubectl mocked) ────

@test "create --product-id: resolves a project ticket and sets parent_id in the INSERT" {
  local mockdir cap
  mockdir="$(mktemp -d)"
  cap="$mockdir/captured.sql"
  cat > "$mockdir/kubectl" <<'MOCKEOF'
#!/usr/bin/env bash
if [[ "$*" == *"get pod"* ]]; then echo "pod/shared-db-0"; exit 0; fi
if [[ "$*" == *"exec"* ]]; then
  input="$(cat)"
  echo "$input" >> "$CAP"
  if [[ "$input" == *"SELECT type, brand, id FROM tickets.tickets"* ]]; then
    echo "project|mentolder|prod-uuid-1"
  else
    echo "T000999|fake-uuid-1234"
  fi
  exit 0
fi
exit 0
MOCKEOF
  chmod +x "$mockdir/kubectl"
  PATH="$mockdir:$PATH" CAP="$cap" \
    run bash "$BATS_TEST_DIRNAME/../../scripts/ticket.sh" create \
      --type feature --title "T" --description "D" --product-id T000100
  [ "$status" -eq 0 ]
  grep -q "parent_id" "$cap"
  rm -rf "$mockdir"
}

@test "create --product-id: fails when the referenced ticket is not type=project" {
  local mockdir cap
  mockdir="$(mktemp -d)"
  cap="$mockdir/captured.sql"
  cat > "$mockdir/kubectl" <<'MOCKEOF'
#!/usr/bin/env bash
if [[ "$*" == *"get pod"* ]]; then echo "pod/shared-db-0"; exit 0; fi
if [[ "$*" == *"exec"* ]]; then
  input="$(cat)"
  echo "$input" >> "$CAP"
  if [[ "$input" == *"SELECT type, brand, id FROM tickets.tickets"* ]]; then
    echo "task|mentolder|prod-uuid-1"
  else
    echo "T000999|fake-uuid-1234"
  fi
  exit 0
fi
exit 0
MOCKEOF
  chmod +x "$mockdir/kubectl"
  PATH="$mockdir:$PATH" CAP="$cap" \
    run bash "$BATS_TEST_DIRNAME/../../scripts/ticket.sh" create \
      --type feature --title "T" --description "D" --product-id T000100
  [ "$status" -ne 0 ]
  [[ "$output" == *"must reference a project ticket"* ]]
  rm -rf "$mockdir"
}

@test "create --product-id: fails on brand mismatch" {
  local mockdir cap
  mockdir="$(mktemp -d)"
  cap="$mockdir/captured.sql"
  cat > "$mockdir/kubectl" <<'MOCKEOF'
#!/usr/bin/env bash
if [[ "$*" == *"get pod"* ]]; then echo "pod/shared-db-0"; exit 0; fi
if [[ "$*" == *"exec"* ]]; then
  input="$(cat)"
  echo "$input" >> "$CAP"
  if [[ "$input" == *"SELECT type, brand, id FROM tickets.tickets"* ]]; then
    echo "project|korczewski|prod-uuid-1"
  else
    echo "T000999|fake-uuid-1234"
  fi
  exit 0
fi
exit 0
MOCKEOF
  chmod +x "$mockdir/kubectl"
  PATH="$mockdir:$PATH" CAP="$cap" \
    run bash "$BATS_TEST_DIRNAME/../../scripts/ticket.sh" create \
      --type feature --title "T" --description "D" --brand mentolder --product-id T000100
  [ "$status" -ne 0 ]
  [[ "$output" == *"brand"* ]]
  rm -rf "$mockdir"
}
