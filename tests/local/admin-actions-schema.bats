#!/usr/bin/env bats
# tests/local/admin-actions-schema.bats
# Verifies the admin_actions DB migration and schema integrity

@test "admin_actions migration exists" {
  run test -f website/src/db/migrations/20260525_admin_actions.sql
  [ "$status" -eq 0 ]
}

@test "admin_actions table can be created from migration" {
  PG_POD=$(kubectl get pod -n workspace --context mentolder -l app=shared-db -o name | head -1)
  [ -n "$PG_POD" ]
  run kubectl exec "$PG_POD" -c postgres -n workspace --context mentolder -- \
    psql -U website -d website -At -c \
    "SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='admin_actions');"
  [ "$status" -eq 0 ]
  [ "$output" = "t" ]
}

@test "admin_actions CHECK constraint rejects invalid status" {
  PG_POD=$(kubectl get pod -n workspace --context mentolder -l app=shared-db -o name | head -1)
  [ -n "$PG_POD" ]
  run kubectl exec "$PG_POD" -c postgres -n workspace --context mentolder -- \
    psql -U website -d website -c "INSERT INTO public.admin_actions (actor, action, status) VALUES ('test', 'test', 'INVALID');"
  [ "$status" -ne 0 ]
}

@test "admin_actions concurrent-idx partial index exists" {
  PG_POD=$(kubectl get pod -n workspace --context mentolder -l app=shared-db -o name | head -1)
  [ -n "$PG_POD" ]
  run kubectl exec "$PG_POD" -c postgres -n workspace --context mentolder -- \
    psql -U website -d website -tAc "SELECT 1 FROM pg_indexes WHERE indexname = 'admin_actions_concurrent_idx';"
  [ "$status" -eq 0 ]
  [ "$output" = "1" ]
}
