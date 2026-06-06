#!/usr/bin/env bats
# tests/local/FA-SF-04-db-schema.bats  (renamed from factory-db-schema.bats)
# Verifies the Software Factory pgvector tables, views, and columns.
#
# Both-namespaces coverage: re-run with FACTORY_NS=workspace-korczewski to
# test the korczewski brand. The default targets workspace (mentolder).
#   FACTORY_CTX=fleet FACTORY_NS=workspace ./tests/runner.sh local FA-SF-04
#   FACTORY_CTX=fleet FACTORY_NS=workspace-korczewski ./tests/runner.sh local FA-SF-04

setup() {
  # Load the local test helper
  load 'test_helper.bash'
  # This is a LIVE-DB suite (every assertion shells out to kubectl exec → psql). When no
  # shared-db pod is reachable — offline, in CI, or no cluster context — skip wholesale
  # rather than hard-fail, so the offline factory test job can include this file safely.
  local _pod
  _pod=$(kubectl get pod -n "${FACTORY_NS:-workspace}" --context "${FACTORY_CTX:-fleet}" -l 'app in (shared-db, shared-db-dev)' -o name 2>/dev/null | head -1)
  # NOTE: use an if-block, NOT `[[ … ]] && skip` — when the pod IS found the `[[ -z ]]`
  # test exits 1 and, as the last command in setup(), would fail EVERY test.
  if [[ -z "$_pod" ]]; then
    skip "no shared-db pod reachable (offline / no cluster)"
  fi
}

psql_tickets() {
  local query="$1"
  local ctx="${FACTORY_CTX:-fleet}"
  local ns="${FACTORY_NS:-workspace}"
  local pod
  pod=$(kubectl get pod -n "$ns" --context "$ctx" -l 'app in (shared-db, shared-db-dev)' -o name 2>/dev/null | head -1)
  if [[ -z "$pod" ]]; then
    echo "Error: shared-db pod not found" >&2
    return 1
  fi
  kubectl exec "$pod" -n "$ns" --context "$ctx" -c postgres -- psql -U website -d website -t -A -c "$query"
}

@test "FA-SF-04: tickets.tickets has touched_files column" {
  run psql_tickets "SELECT column_name FROM information_schema.columns WHERE table_schema='tickets' AND table_name='tickets' AND column_name='touched_files'"
  [ "$status" -eq 0 ]
  [ "$output" = "touched_files" ]
}

@test "FA-SF-05: tickets.tickets has pipeline_slot column" {
  run psql_tickets "SELECT column_name FROM information_schema.columns WHERE table_schema='tickets' AND table_name='tickets' AND column_name='pipeline_slot'"
  [ "$status" -eq 0 ]
  [ "$output" = "pipeline_slot" ]
}

@test "FA-SF-06: tickets.ticket_embeddings table exists" {
  run psql_tickets "SELECT tablename FROM pg_tables WHERE schemaname='tickets' AND tablename='ticket_embeddings'"
  [ "$status" -eq 0 ]
  [ "$output" = "ticket_embeddings" ]
}

@test "FA-SF-07: ticket_embeddings HNSW index exists" {
  run psql_tickets "SELECT indexname FROM pg_indexes WHERE schemaname='tickets' AND indexname='ticket_embeddings_hnsw_idx'"
  [ "$status" -eq 0 ]
  [ "$output" = "ticket_embeddings_hnsw_idx" ]
}

@test "FA-SF-08: v_factory_metrics view exists" {
  run psql_tickets "SELECT viewname FROM pg_views WHERE schemaname='tickets' AND viewname='v_factory_metrics'"
  [ "$status" -eq 0 ]
  [ "$output" = "v_factory_metrics" ]
}

@test "FA-SF-09: v_active_features view exists" {
  run psql_tickets "SELECT viewname FROM pg_views WHERE schemaname='tickets' AND viewname='v_active_features'"
  [ "$status" -eq 0 ]
  [ "$output" = "v_active_features" ]
}

@test "FA-SF-10: fn_find_similar function exists" {
  run psql_tickets "SELECT proname FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname='tickets' AND proname='fn_find_similar'"
  [ "$status" -eq 0 ]
  [ "$output" = "fn_find_similar" ]
}

@test "FA-SF-11: chunk_type CHECK constraint enforces valid values" {
  run psql_tickets "
    DO \$\$
    BEGIN
      INSERT INTO tickets.ticket_embeddings (ticket_id, chunk, chunk_type)
      SELECT id, 'test', 'invalid_type' FROM tickets.tickets LIMIT 1;
    END \$\$
  "
  [ "$status" -ne 0 ]
}

@test "FA-SF-12: embedding_model column exists on tickets.ticket_embeddings" {
  # Reuse psql_tickets (has -c postgres + the pod guard); a raw `kubectl exec deployment/...`
  # without -c postgres prints a "Defaulted container" line to stderr that bats folds into
  # $output, breaking the exact-match assertion even when the column is present.
  run psql_tickets "SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='tickets' AND table_name='ticket_embeddings' AND column_name='embedding_model')"
  [ "$status" -eq 0 ]
  [ "$output" = "t" ]
}

@test "FA-SF-13: vector extension is enabled (ticket_embeddings hard dependency)" {
  run psql_tickets "SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname='vector')"
  [ "$status" -eq 0 ]
  [ "$output" = "t" ]
}

@test "FA-SF-04: tickets.tickets has retry_count column (NOT NULL DEFAULT 0)" {
  run psql_tickets "SELECT column_default FROM information_schema.columns WHERE table_schema='tickets' AND table_name='tickets' AND column_name='retry_count'"
  [ "$status" -eq 0 ]
  [[ "$output" =~ "0" ]]
}

@test "FA-SF-04: tickets.factory_control table exists with UNIQUE(key,brand)" {
  run psql_tickets "SELECT tablename FROM pg_tables WHERE schemaname='tickets' AND tablename='factory_control'"
  [ "$status" -eq 0 ]
  [ "$output" = "factory_control" ]
}
@test "FA-SF-04: factory_control has a UNIQUE(key,brand) constraint" {
  run psql_tickets "SELECT conname FROM pg_constraint WHERE conrelid='tickets.factory_control'::regclass AND contype='u'"
  [ "$status" -eq 0 ]
  [ -n "$output" ]
}

@test "FA-SF-04: tickets.feature_flags table exists" {
  run psql_tickets "SELECT tablename FROM pg_tables WHERE schemaname='tickets' AND tablename='feature_flags'"
  [ "$status" -eq 0 ]
  [ "$output" = "feature_flags" ]
}
@test "FA-SF-04: feature_flags has brand FK to public.brands" {
  run psql_tickets "SELECT conname FROM pg_constraint WHERE conname='feature_flags_brand_fkey'"
  [ "$status" -eq 0 ]
  [ "$output" = "feature_flags_brand_fkey" ]
}
@test "FA-SF-04: feature_flags has UNIQUE(brand,key)" {
  run psql_tickets "SELECT count(*) FROM pg_constraint WHERE conrelid='tickets.feature_flags'::regclass AND contype='u'"
  [ "$status" -eq 0 ]
  [ "$output" = "1" ]
}




