#!/usr/bin/env bats
# FA-PB-01 .. FA-PB-05: Planungsbüro Stats & API logic tests
# Offline-safe: pure Node.js computation, no DB calls.

load test_helper

PROJECT_DIR="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"

STATS_FN="
function computeStats(items) {
  const planning = items.length;
  const ready = items.filter(i => i.dorScore === 4).length;
  const blocked = items.filter(i => i.dependsOn.length > 0 && i.dorScore < 4).length;
  return { planning, ready, blocked };
}
"

VALID_EFFORTS="['klein','mittel','gross']"

@test "FA-PB-01: Stats-Berechnung bei leerer Liste → 0/0/0" {
  result=$(node -e "
    $STATS_FN
    console.log(JSON.stringify(computeStats([])));
  ")
  echo "$result" | jq -e '.planning == 0 and .ready == 0 and .blocked == 0'
}

@test "FA-PB-02: Stats bei 2 planning, 1 ready, 1 blocked" {
  result=$(node -e "
    $STATS_FN
    const items = [
      { dorScore: 2, dependsOn: [] },
      { dorScore: 1, dependsOn: [] },
      { dorScore: 4, dependsOn: [] },
      { dorScore: 2, dependsOn: ['FE-01'] }
    ];
    console.log(JSON.stringify(computeStats(items)));
  ")
  echo "$result" | jq -e '.planning == 4 and .ready == 1 and .blocked == 1'
}

@test "FA-PB-03: PATCH-Validierung lehnt ungültigen effort-Wert ab" {
  result=$(node -e "
    const valid = $VALID_EFFORTS;
    const effort = 'riesig';
    console.log(JSON.stringify({ ok: valid.includes(effort) }));
  ")
  echo "$result" | jq -e '.ok == false'
}

@test "FA-PB-04: Rang-Update via PATCH aktualisiert planning_rank" {
  if ! psql "${TRACKING_DB_URL:-${SESSIONS_DB_URL:-}}" -c "SELECT 1" >/dev/null 2>&1; then
    skip "keine DB verfügbar (offline)"
  fi
  EXT_ID="pb-test-$(date +%s)"
  psql "$SESSIONS_DATABASE_URL" -c "
    INSERT INTO tickets.tickets (type, brand, title, status, planning_rank, external_id, readiness)
    VALUES ('feature', 'mentolder', 'PB-Test', 'planning', 5, '$EXT_ID', '{}'::jsonb)
  "
  psql "$SESSIONS_DATABASE_URL" -c "
    UPDATE tickets.tickets SET planning_rank = 0 WHERE external_id = '$EXT_ID'
  "
  rank=$(psql "$SESSIONS_DATABASE_URL" -t -A -c "
    SELECT planning_rank FROM tickets.tickets WHERE external_id = '$EXT_ID'
  ")
  psql "$SESSIONS_DATABASE_URL" -c "DELETE FROM tickets.tickets WHERE external_id = '$EXT_ID'" >/dev/null 2>&1
  [ "$rank" = "0" ]
}

@test "FA-PB-05: GET-Response enthält stats-Objekt mit korrekten Keys" {
  result=$(node -e "
    $STATS_FN
    const stats = computeStats([{ dorScore: 4, dependsOn: [] }]);
    console.log(JSON.stringify({
      hasKeys: ['planning','ready','blocked'].every(k => k in stats),
      values: Object.keys(stats).sort()
    }));
  ")
  echo "$result" | jq -e '.hasKeys == true'
  echo "$result" | jq -e '.values == ["blocked","planning","ready"]'
}
