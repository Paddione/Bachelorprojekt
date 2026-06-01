#!/usr/bin/env bats
# tests/local/learning-db-schema.bats
# Verifies learning_progress and onboarding_state tables, columns, constraints, and indexes.

setup() {
  load 'test_helper.bash'
}

psql_website() {
  local query="$1"
  local ctx="${FACTORY_CTX:-devc}"
  local ns="${FACTORY_NS:-workspace-dev}"
  local pod
  pod=$(kubectl get pod -n "$ns" --context "$ctx" -l 'app in (shared-db, shared-db-dev)' -o name 2>/dev/null | head -1)
  if [[ -z "$pod" ]]; then
    echo "Error: shared-db pod not found" >&2
    return 1
  fi
  kubectl exec "$pod" -n "$ns" --context "$ctx" -c postgres -- psql -U website -d website -t -A -c "$query"
}

@test "LR-01: learning_progress table exists" {
  run psql_website "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename='learning_progress'"
  [ "$status" -eq 0 ]
  [ "$output" = "learning_progress" ]
}

@test "LR-02: learning_progress has keycloak_user_id column" {
  run psql_website "SELECT column_name, is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='learning_progress' AND column_name='keycloak_user_id'"
  [ "$status" -eq 0 ]
  [[ "$output" =~ "keycloak_user_id" ]]
  [[ "$output" =~ "NO" ]]
}

@test "LR-03: learning_progress has brand column" {
  run psql_website "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='learning_progress' AND column_name='brand'"
  [ "$status" -eq 0 ]
  [ "$output" = "brand" ]
}

@test "LR-04: learning_progress has item_type column" {
  run psql_website "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='learning_progress' AND column_name='item_type'"
  [ "$status" -eq 0 ]
  [ "$output" = "item_type" ]
}

@test "LR-05: learning_progress.item_type CHECK constraint enforces ('goal','tool')" {
  run psql_website "
    DO \$\$ BEGIN
      INSERT INTO learning_progress (keycloak_user_id, brand, item_type, item_id, status)
      VALUES ('test-user', 'mentolder', 'invalid_type', 'test-id', 'todo');
    EXCEPTION WHEN check_violation THEN
      RETURN;
    END \$\$
  "
  [ "$status" -eq 0 ]
}

@test "LR-06: learning_progress has status column" {
  run psql_website "SELECT column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='learning_progress' AND column_name='status'"
  [ "$status" -eq 0 ]
  [[ "$output" =~ "todo" ]]
}

@test "LR-07: learning_progress.status CHECK constraint enforces ('todo','in_progress','done')" {
  run psql_website "
    DO \$\$ BEGIN
      INSERT INTO learning_progress (keycloak_user_id, brand, item_type, item_id, status)
      VALUES ('test-user', 'mentolder', 'goal', 'test-id', 'invalid_status');
    EXCEPTION WHEN check_violation THEN
      RETURN;
    END \$\$
  "
  [ "$status" -eq 0 ]
}

@test "LR-08: learning_progress has note, started_at, completed_at, updated_at columns" {
  run psql_website "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='learning_progress' AND column_name IN ('note','started_at','completed_at','updated_at')"
  [ "$status" -eq 0 ]
  [ "$output" = "4" ]
}

@test "LR-09: learning_progress UNIQUE constraint" {
  run psql_website "
    DO \$\$ BEGIN
      INSERT INTO learning_progress (keycloak_user_id, brand, item_type, item_id, status) VALUES ('u1', 'mentolder', 'goal', 'g1', 'todo');
      INSERT INTO learning_progress (keycloak_user_id, brand, item_type, item_id, status) VALUES ('u1', 'mentolder', 'goal', 'g1', 'done');
    EXCEPTION WHEN unique_violation THEN
      RETURN;
    END \$\$
  "
  [ "$status" -eq 0 ]
}

@test "LR-10: idx_learning_progress_admin_agg index exists" {
  run psql_website "SELECT indexname FROM pg_indexes WHERE schemaname='public' AND indexname='idx_learning_progress_admin_agg'"
  [ "$status" -eq 0 ]
  [ "$output" = "idx_learning_progress_admin_agg" ]
}

@test "LR-11: idx_learning_progress_updated index exists" {
  run psql_website "SELECT indexname FROM pg_indexes WHERE schemaname='public' AND indexname='idx_learning_progress_updated'"
  [ "$status" -eq 0 ]
  [ "$output" = "idx_learning_progress_updated" ]
}

@test "LR-12: onboarding_state table exists" {
  run psql_website "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename='onboarding_state'"
  [ "$status" -eq 0 ]
  [ "$output" = "onboarding_state" ]
}

@test "LR-13: onboarding_state has keycloak_user_id, brand, step_id, completed_at columns" {
  run psql_website "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='onboarding_state' AND column_name IN ('keycloak_user_id','brand','step_id','completed_at')"
  [ "$status" -eq 0 ]
  [ "$output" = "4" ]
}

@test "LR-14: onboarding_state UNIQUE constraint" {
  run psql_website "
    DO \$\$ BEGIN
      INSERT INTO onboarding_state (keycloak_user_id, brand, step_id) VALUES ('u1', 'mentolder', 's1');
      INSERT INTO onboarding_state (keycloak_user_id, brand, step_id) VALUES ('u1', 'mentolder', 's1');
    EXCEPTION WHEN unique_violation THEN
      RETURN;
    END \$\$
  "
  [ "$status" -eq 0 ]
}
