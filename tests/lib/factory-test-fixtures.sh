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
  local ctx="${FACTORY_CTX:-fleet}"
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

# purge_factory_test_data <brand> — reap all is_test_data=true rows on that brand
purge_factory_test_data() {
  local brand="$1"
  local ctx="${FACTORY_CTX:-fleet}" ns
  case "$brand" in
    mentolder)  ns="workspace" ;;
    korczewski) ns="workspace-korczewski" ;;
    *) echo "purge_factory_test_data: unknown brand $brand" >&2; return 2 ;;
  esac

  # If context is a dev cluster, append -dev to namespace
  if [[ "$ctx" == k3d-* || "$ctx" == *-dev ]]; then
    if [[ "$ns" == "workspace" ]]; then
      ns="workspace-dev"
    elif [[ "$ns" == "workspace-korczewski" ]]; then
      ns="workspace-korczewski-dev"
    fi
  fi
  local pod
  pod=$(kubectl get pod -n "$ns" --context "$ctx" -l 'app in (shared-db, shared-db-dev)' -o name 2>/dev/null | head -1)
  [[ -z "$pod" ]] && { echo "no shared-db pod in $ns" >&2; return 1; }
  kubectl exec -i "$pod" -n "$ns" --context "$ctx" -c postgres -- \
    psql -U postgres -d website -qtAc "SELECT tickets.fn_purge_test_data();" >/dev/null
}
