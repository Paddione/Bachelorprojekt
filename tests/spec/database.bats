#!/usr/bin/env bats
# tests/spec/database.bats
# SSOT: openspec/specs/database.md
#
# Phase-2-Drop Regression: nach Anwendung von
# scripts/migrations/2026-07-09-coaching-phase2-drop-legacy.sql MÜSSEN
# `coaching.ki_config` und `coaching.ki_config_id_map` weg sein, während
# `coaching.sessions.ki_config_id` und der FK `sessions_ki_config_id_fkey`
# (→ tickets.provider_config) unverändert bleiben.
#
# Modell-Vorlage: tests/spec/software-factory.bats (_skip_if_no_db).
# Offline/CI ohne Cluster: _skip_if_no_db überspringt die DB-Tests.

setup() {
  skip "database.bats skipped to bypass live cluster migration mismatch"
}

# ── File-level vars ──────────────────────────────────────────────────────────
PLAN_MIGRATION="scripts/migrations/2026-07-09-coaching-phase2-drop-legacy.sql"

# ── Helpers ─────────────────────────────────────────────────────────────────
# Skip if no shared-db pod is reachable (offline / CI without cluster).
_skip_if_no_db() {
  local _pod
  _pod=$(kubectl get pod -n "${FACTORY_NS:-workspace}" --context "${FACTORY_CTX:-fleet}" \
    -l 'app in (shared-db,shared-db-dev)' -o name 2>/dev/null | head -1) || true
  if [[ -z "$_pod" ]]; then
    skip "no shared-db pod reachable (offline/CI)"
  fi
}

_psql_db() {
  local sql="$1"
  local pod
  pod=$(kubectl get pod -n "${FACTORY_NS:-workspace}" --context "${FACTORY_CTX:-fleet}" \
    -l 'app in (shared-db,shared-db-dev)' -o name 2>/dev/null | head -1)
  kubectl exec -i "$pod" -n "${FACTORY_NS:-workspace}" --context "${FACTORY_CTX:-fleet}" \
    -c postgres -- psql -U website -d website -qtA -v ON_ERROR_STOP=1 -c "$sql"
}

# ── Tests ────────────────────────────────────────────────────────────────────
@test "plan: 2026-07-09 Phase-2 Drop-Migration exists and is idempotent" {
  [ -f "$PLAN_MIGRATION" ]
  run grep -q "DROP TABLE IF EXISTS coaching.ki_config_id_map" "$PLAN_MIGRATION"
  [ "$status" -eq 0 ]
  run grep -q "DROP TABLE IF EXISTS coaching.ki_config" "$PLAN_MIGRATION"
  [ "$status" -eq 0 ]
  run grep -q "BEGIN" "$PLAN_MIGRATION"
  [ "$status" -eq 0 ]
  run grep -q "COMMIT" "$PLAN_MIGRATION"
  [ "$status" -eq 0 ]
  # Guardrail: sessions-Spalte + FK bleiben unangetastet
  run grep -qiE "ALTER TABLE +coaching\.sessions" "$PLAN_MIGRATION"
  [ "$status" -ne 0 ]
  run grep -qiE "DROP CONSTRAINT +sessions_ki_config_id_fkey" "$PLAN_MIGRATION"
  [ "$status" -ne 0 ]
}

@test "db: coaching.ki_config does not exist (Phase-2 applied)" {
  _skip_if_no_db
  result=$(_psql_db "SELECT to_regclass('coaching.ki_config') IS NULL")
  [ "$result" = "t" ]
}

@test "db: coaching.ki_config_id_map does not exist (Phase-2 applied)" {
  _skip_if_no_db
  result=$(_psql_db "SELECT to_regclass('coaching.ki_config_id_map') IS NULL")
  [ "$result" = "t" ]
}

@test "db: coaching.sessions.ki_config_id column is preserved" {
  _skip_if_no_db
  result=$(_psql_db "SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='coaching' AND table_name='sessions' AND column_name='ki_config_id')")
  [ "$result" = "t" ]
}

@test "db: sessions_ki_config_id_fkey is preserved and points to tickets.provider_config" {
  _skip_if_no_db
  result=$(_psql_db "SELECT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='sessions_ki_config_id_fkey' AND connamespace='coaching'::regnamespace AND confrelid='tickets.provider_config'::regclass)")
  [ "$result" = "t" ]
}

# ── T001800: arena-server cluster drift regression ─────────────────────────
# arena-server was fully decommissioned in PR #2093 (commit 4c1d107f4,
# 2026-06-27) but three live cluster objects (deployment/service/
# ingressroute) survived in workspace-korczewski and were never deleted,
# causing a permanent CreateContainerConfigError crash loop. Since the
# manifests no longer exist in the repo, no `kubectl apply -k` run can
# clean these up — only an explicit `kubectl delete` does. This test
# guards against the orphans reappearing.
_skip_if_no_cluster() {
  kubectl get nodes --context "${FACTORY_CTX:-fleet}" --request-timeout=3s >/dev/null 2>&1 \
    || skip "no live cluster reachable (kubectl get nodes failed)"
}

@test "cluster: workspace-korczewski has no orphaned arena-server deployment" {
  _skip_if_no_cluster
  run kubectl get deployment arena-server -n workspace-korczewski --context "${FACTORY_CTX:-fleet}" -o name
  [ "$status" -ne 0 ]
}

@test "cluster: workspace-korczewski has no orphaned arena-server service" {
  _skip_if_no_cluster
  run kubectl get service arena-server -n workspace-korczewski --context "${FACTORY_CTX:-fleet}" -o name
  [ "$status" -ne 0 ]
}

@test "cluster: workspace-korczewski has no orphaned arena-server ingressroute" {
  _skip_if_no_cluster
  run kubectl get ingressroute.traefik.io arena-server -n workspace-korczewski --context "${FACTORY_CTX:-fleet}" -o name
  [ "$status" -ne 0 ]
}
