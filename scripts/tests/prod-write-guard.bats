#!/usr/bin/env bats
# scripts/tests/prod-write-guard.bats — Tests for prod-write-guard.sh [T001954]

GUARD="$BATS_TEST_DIRNAME/../prod-write-guard.sh"

setup() {
  export PROD_WRITE_GUARD_DENYLIST="mentolder,workspace-korczewski"
}

# --- Namespace detection ---

@test "workspace namespace allowed for writes" {
  run bash "$GUARD" check "workspace" "CREATE INDEX idx ON tickets(t_id);"
  [ "$status" -eq 0 ]
  [[ "$output" == *"not in denylist"* ]]
}

@test "mentolder namespace blocks DDL" {
  run bash "$GUARD" check "mentolder" "CREATE INDEX idx ON tickets(t_id);"
  [ "$status" -eq 1 ]
  [[ "$output" == *"prod-write-blocked"* ]]
  [[ "$output" == *"namespace=mentolder"* ]]
}

@test "workspace-korczewski namespace blocks DML" {
  run bash "$GUARD" check "workspace-korczewski" "INSERT INTO tickets (title) VALUES ('test');"
  [ "$status" -eq 1 ]
  [[ "$output" == *"prod-write-blocked"* ]]
}

# --- SQL keyword detection ---

@test "SELECT is always allowed" {
  run bash "$GUARD" check "mentolder" "SELECT * FROM tickets;"
  [ "$status" -eq 0 ]
  [[ "$output" == *"read-only"* ]]
}

@test "CREATE is blocked" {
  run bash "$GUARD" check "mentolder" "CREATE TABLE foo (id int);"
  [ "$status" -eq 1 ]
}

@test "INSERT is blocked" {
  run bash "$GUARD" check "mentolder" "INSERT INTO foo VALUES (1);"
  [ "$status" -eq 1 ]
}

@test "UPDATE is blocked" {
  run bash "$GUARD" check "mentolder" "UPDATE foo SET id = 2;"
  [ "$status" -eq 1 ]
}

@test "DELETE is blocked" {
  run bash "$GUARD" check "mentolder" "DELETE FROM foo WHERE id = 1;"
  [ "$status" -eq 1 ]
}

@test "ALTER is blocked" {
  run bash "$GUARD" check "mentolder" "ALTER TABLE foo ADD COLUMN bar int;"
  [ "$status" -eq 1 ]
}

@test "DROP is blocked" {
  run bash "$GUARD" check "mentolder" "DROP TABLE foo;"
  [ "$status" -eq 1 ]
}

@test "TRUNCATE is blocked" {
  run bash "$GUARD" check "mentolder" "TRUNCATE foo;"
  [ "$status" -eq 1 ]
}

# --- Override flag ---

@test "override allows write against prod" {
  run bash "$GUARD" check "mentolder" "CREATE INDEX idx ON t(c);" "--confirm-prod-write"
  [ "$status" -eq 0 ]
  [[ "$output" == *"override"* ]]
}

@test "override without write keyword is still allowed" {
  run bash "$GUARD" check "mentolder" "SELECT 1;" "--confirm-prod-write"
  [ "$status" -eq 0 ]
}

# --- Structured output ---

@test "blocked output has structured format" {
  run bash "$GUARD" check "mentolder" "DROP TABLE foo;"
  [ "$status" -eq 1 ]
  [[ "$output" =~ ^GUARD:\ prod-write-blocked\ namespace= ]]
}

@test "allowed output has structured format" {
  run bash "$GUARD" check "workspace" "SELECT 1;"
  [ "$status" -eq 0 ]
  [[ "$output" =~ ^GUARD:\ prod-write-allowed\ namespace= ]]
}

# --- Edge cases ---

@test "case insensitive DDL detection" {
  run bash "$GUARD" check "mentolder" "create index idx on t(c);"
  [ "$status" -eq 1 ]
}

@test "multiline SQL with write keyword" {
  run bash "$GUARD" check "mentolder" "SELECT 1;
CREATE INDEX idx ON t(c);"
  [ "$status" -eq 1 ]
}

@test "empty SQL is read-only" {
  run bash "$GUARD" check "mentolder" ""
  [ "$status" -eq 0 ]
  [[ "$output" == *"empty-sql"* ]]
}
