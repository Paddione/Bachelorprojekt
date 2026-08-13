#!/usr/bin/env bash
# tests/lib/factory-test-fixtures.sh — seed + reap throwaway feature tickets for
# Software Factory FA-SF BATS tests. SOURCE, do not execute.
#
#   source tests/lib/factory-test-fixtures.sh
#   ext_id=$(seed_test_feature korczewski "tests/fixtures/sf-test-foo-a.txt")
#   ... assertions ...
#   purge_factory_test_data korczewski   # in teardown()
#
# Every seeded ticket carries is_test_data=true and a unique 'SF-TEST-' title and
# is reaped by tickets.fn_purge_test_data(). Pass DISJOINT touched_file paths per
# test so the conflict gate does not legitimately fire between fixtures. Do NOT
# run concurrently with the Playwright e2e suite (shared global purge).

# Resolve the repo root from this file's location so the fixture works
# regardless of the BATS working directory.
_FIXTURE_REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# seed_test_feature <brand> [touched_file ...] → echoes the new external_id
seed_test_feature() {
  local brand="$1"; shift
  # Default seit E3/T002626: SDLC-Daten liegen lokal (siehe scripts/ticket.sh).
  local ctx="${FACTORY_CTX:-k3d-mentolder-dev}"
  if [[ "$ctx" == "fleet" && -z "${FACTORY_ALLOW_PROD_SEED:-}" ]]; then
    echo "refusing to seed test data into prod context 'fleet' (set FACTORY_ALLOW_PROD_SEED=1 to override)" >&2
    return 3
  fi
  local files; files="$(IFS=,; echo "$*")"
  local title="SF-TEST-${brand}-${BATS_TEST_NAME:-manual}-$$-${RANDOM}"
  local result ext_id
  result=$(BRAND="$brand" TICKET_CTX="$ctx" bash "$_FIXTURE_REPO_ROOT/scripts/ticket.sh" create \
    --type feature --brand "$brand" --title "$title" \
    --description "factory fixture" --priority mittel --status backlog --is-test-data)
  ext_id="${result%%|*}"
  if [[ -n "$files" ]]; then
    BRAND="$brand" TICKET_CTX="$ctx" bash "$_FIXTURE_REPO_ROOT/scripts/ticket.sh" set-touched-files --id "$ext_id" --files "$files" >/dev/null
  fi
  echo "$ext_id"
}

# ensure_purge_fn_current <pod> <ns> <ctx> — self-heal the purge function against
# the repo's newest one-shot migration (T003285). Parses the RUNTIME-CHECK line
# of the newest purge-fn-v*.sql (same contract as scripts/runtime-drift-check.sh)
# and applies the file only when pg_proc.prosrc lacks the marker — so the teardown
# path works with the repo state, not with whatever manual deploy state the DB
# happens to be in. A failing apply returns 1 so the purge fails visibly instead
# of silently purging nothing.
ensure_purge_fn_current() {
  local pod="$1" ns="$2" ctx="$3"
  local latest marker_line fn_line schema fn marker out
  latest="$(ls -1 "$_FIXTURE_REPO_ROOT/scripts/one-shot/"purge-fn-v*.sql 2>/dev/null | sort -V | tail -1)"
  [[ -n "$latest" ]] || return 0   # no migration file — nothing to self-heal with
  marker_line="$(grep -m1 -- '-- RUNTIME-CHECK:' "$latest" 2>/dev/null || true)"
  [[ -n "$marker_line" ]] || return 0   # no marker contract — not a drift-checked object
  # Regex identisch zu scripts/runtime-drift-check.sh (marker/function auf
  # [a-z0-9_]+ beschraenkt — die psql-Query wird nicht aus Dateiinhalten
  # konstruiert, kein SQL-Injection-Surface).
  [[ "$marker_line" =~ function=([a-z_]+)\.([a-z_]+)[[:space:]]+marker=([a-z0-9_]+) ]] || return 0
  schema="${BASH_REMATCH[1]}"; fn="${BASH_REMATCH[2]}"; marker="${BASH_REMATCH[3]}"
  out="$(kubectl exec -i "$pod" -n "$ns" --context "$ctx" -c postgres -- \
    psql -U postgres -d website -qtAc \
    "SELECT prosrc LIKE '%${marker}%' FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = '${schema}' AND p.proname = '${fn}';" 2>/dev/null)"
  [[ "$out" == "t" ]] && return 0
  echo "self-heal: applying $latest to ${schema}.${fn} (Marker '$marker' fehlt in pg_proc)" >&2
  kubectl exec -i "$pod" -n "$ns" --context "$ctx" -c postgres -- \
    psql -U postgres -d website < "$latest"
}

# purge_factory_test_data <brand> — reap all is_test_data=true rows on that brand
purge_factory_test_data() {
  local brand="$1"
  local ctx="${FACTORY_CTX:-k3d-mentolder-dev}" ns
  # [T002689] Die Brand waehlt ZEILEN, nicht den Ort. seed_test_feature schreibt
  # ueber scripts/ticket.sh, das seit T002689 fuer beide Brands nach `workspace`
  # aufloest — eine Purge in `workspace-korczewski` fand die eigenen Fixtures
  # daher nicht mehr und liesse Testzeilen stehen.
  case "$brand" in
    mentolder|korczewski) ns="${FACTORY_NS:-workspace}" ;;
    *) echo "purge_factory_test_data: unknown brand $brand" >&2; return 2 ;;
  esac

  # Resolve namespace by searching in likely candidates, not by guessing from the
  # context name. The k3d dev cluster runs shared-db in 'workspace', not
  # 'workspace-dev' — the old hardcoded -dev suffix was wrong. [T002781]
  local pod candidate_ns
  for candidate_ns in "$ns" "${ns}-dev"; do
    pod=$(kubectl get pod -n "$candidate_ns" --context "$ctx" \
      -l 'app in (shared-db, shared-db-dev)' --field-selector status.phase=Running \
      -o name 2>/dev/null | head -1)
    [[ -n "$pod" ]] && { ns="$candidate_ns"; break; }
  done
  [[ -z "$pod" ]] && { echo "no shared-db pod in $ns" >&2; return 1; }
  # Selbstheilung vor dem Purge-Aufruf (T003285): fehlt der Marker der neuesten
  # Migration in der DB-Funktion, wird sie eingespielt — der Teardown arbeitet mit
  # dem Repo-Stand statt mit dem zufaelligen Deploy-Zustand der DB. Ein fehl-
  # schlagender Apply laesst den Purge sichtbar scheitern.
  ensure_purge_fn_current "$pod" "$ns" "$ctx" || return 1
  kubectl exec -i "$pod" -n "$ns" --context "$ctx" -c postgres -- \
    psql -U postgres -d website -qtAc "SELECT tickets.fn_purge_test_data();" >/dev/null
}
