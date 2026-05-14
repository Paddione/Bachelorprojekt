#!/usr/bin/env bats
# Unit test for the software-history classifier CLI.
# Uses a tiny ephemeral Postgres (via psql against TEST_PG_URL) + a stub Anthropic endpoint.

setup() {
  if [[ -z "${TEST_PG_URL:-}" ]]; then
    skip "TEST_PG_URL not set — set to a throwaway postgres URL to enable this test"
  fi
  export MOCK_PORT=4173
  export LITELLM_URL="http://127.0.0.1:${MOCK_PORT}"
  export ANTHROPIC_API_KEY="sk-local"
  export TRACKING_DB_URL="$TEST_PG_URL"

  node tests/unit/fixtures/software-history/mock-anthropic.mjs &
  MOCK_PID=$!
  sleep 0.2

  psql "$TEST_PG_URL" -v ON_ERROR_STOP=1 -f deploy/tracking/init.sql >/dev/null
  psql "$TEST_PG_URL" -v ON_ERROR_STOP=1 <<SQL
TRUNCATE bachelorprojekt.software_events CASCADE;
TRUNCATE bachelorprojekt.features CASCADE;
INSERT INTO bachelorprojekt.features (pr_number, title, description, category, merged_at, status) VALUES
  (1, 'feat: add mattermost', 'introduce mattermost', 'feat', '2025-01-01', 'shipped'),
  (2, 'chore: replace mattermost', 'remove mattermost, add native chat', 'chore', '2025-03-01', 'shipped'),
  (3, 'docs: tweak readme', 'wording', 'docs', '2025-04-01', 'shipped');
SQL
}

teardown() {
  [[ -n "${MOCK_PID:-}" ]] && kill "$MOCK_PID" 2>/dev/null || true
}

@test "classifies every unclassified PR exactly once" {
  run bash -c 'cd website && npx tsx ../scripts/software-history-classify.mts'
  [ "$status" -eq 0 ]

  run psql -At "$TEST_PG_URL" -c "SELECT count(*) FROM bachelorprojekt.software_events"
  [ "$output" -eq 4 ]   # 1 + 2 + 1
}

@test "re-run is idempotent" {
  bash -c 'cd website && npx tsx ../scripts/software-history-classify.mts' >/dev/null
  run bash -c 'cd website && npx tsx ../scripts/software-history-classify.mts'
  [ "$status" -eq 0 ]
  run psql -At "$TEST_PG_URL" -c "SELECT count(*) FROM bachelorprojekt.software_events"
  [ "$output" -eq 4 ]
}

@test "manual overrides survive --force re-run" {
  bash -c 'cd website && npx tsx ../scripts/software-history-classify.mts' >/dev/null
  psql "$TEST_PG_URL" -v ON_ERROR_STOP=1 -c \
    "UPDATE bachelorprojekt.software_events SET classifier='manual', service='manually-renamed' WHERE pr_number=1"

  run bash -c 'cd website && npx tsx ../scripts/software-history-classify.mts --retry-failed'
  [ "$status" -eq 0 ]

  run psql -At "$TEST_PG_URL" -c "SELECT service FROM bachelorprojekt.software_events WHERE pr_number=1"
  [ "$output" = "manually-renamed" ]
}

@test "--limit caps work" {
  run bash -c 'cd website && npx tsx ../scripts/software-history-classify.mts --limit=1'
  [ "$status" -eq 0 ]
  run psql -At "$TEST_PG_URL" -c "SELECT count(DISTINCT pr_number) FROM bachelorprojekt.software_events"
  [ "$output" -eq 1 ]
}
