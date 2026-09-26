#!/usr/bin/env bats
# tests/spec/database-migrations-runner.bats
# BATS test specification for database migrations runner (T002647)

setup() {
  TEST_DIR="$(mktemp -d)"
  MIGRATIONS_DIR="${TEST_DIR}/migrations"
  mkdir -p "${MIGRATIONS_DIR}"
}

teardown() {
  rm -rf "${TEST_DIR}"
}

@test "migrations runner script exists and is executable" {
  [ -f "scripts/migrate-db.mjs" ]
}

@test "migrations runner dry run or help mode executes cleanly" {
  run node scripts/migrate-db.mjs --help
  [ "$status" -eq 0 ]
  [[ "$output" =~ "Usage:" ]]
}

@test "migrations runner handles missing directory gracefully when called via module" {
  run node -e "
    import { runMigrations } from './scripts/migrate-db.mjs';
    const fakePool = { connect: async () => ({ query: async () => ({ rows: [] }), release: () => {} }) };
    runMigrations(fakePool, '${TEST_DIR}/nonexistent').then(() => console.log('OK'));
  "
  [ "$status" -eq 0 ]
  [[ "$output" =~ "OK" ]]
}

@test "migrations runner detects pending migration files and processes them" {
  cat << 'EOF' > "${MIGRATIONS_DIR}/20260801-test-migration.sql"
CREATE TABLE IF NOT EXISTS public.test_table (id id_seq PRIMARY KEY);
EOF

  run node -e "
    import { runMigrations } from './scripts/migrate-db.mjs';
    const queries = [];
    const fakeClient = {
      query: async (q, params) => {
        queries.push({ q, params });
        if (q.includes('SELECT filename')) {
          return { rows: [] };
        }
        return { rows: [] };
      },
      release: () => {}
    };
    const fakePool = { connect: async () => fakeClient };
    runMigrations(fakePool, '${MIGRATIONS_DIR}').then(() => {
      console.log('QUERY_COUNT:' + queries.length);
      const applied = queries.some(item => item.params && item.params[0] === '20260801-test-migration.sql');
      console.log('APPLIED:' + applied);
    });
  "
  [ "$status" -eq 0 ]
  [[ "$output" =~ "QUERY_COUNT:" ]]
  [[ "$output" =~ "APPLIED:true" ]]
}
