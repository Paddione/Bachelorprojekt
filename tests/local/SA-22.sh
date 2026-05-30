#!/usr/bin/env bash
# SA-22: Cross-brand isolation on the fleet cluster — a pod in one brand's
# namespace must NOT reach the other brand's shared-db. Proves DSGVO logical
# isolation between mentolder (ns workspace) and korczewski (ns
# workspace-korczewski) when both brands share one physical cluster.
#
# NOTE: numbered SA-22 (not SA-08 as the plan/spec drafted) — SA-08 is the
# existing Keycloak OIDC SSO test. Highest prior SA id is SA-21.
#
# T1: korczewski pod -> mentolder shared-db:5432  must be BLOCKED
# T2: mentolder pod  -> korczewski shared-db:5432 must be BLOCKED
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"

CTX="${FLEET_CONTEXT:-fleet}"
KUBECTL="kubectl --context ${CTX}"

# Probe TCP reachability from a throwaway busybox pod. Prints OPEN or BLOCKED.
# A 4s nc timeout means a NetworkPolicy drop surfaces as BLOCKED, not a hang.
probe() {  # probe <from-ns> <target-fqdn> <port>
  local from_ns="$1" target="$2" port="$3" name="netcheck-${RANDOM}"
  $KUBECTL run "$name" -n "$from_ns" --rm -i --restart=Never \
    --image=busybox:1.36 --quiet -- \
    sh -c "nc -z -w4 ${target} ${port} >/dev/null 2>&1 && echo OPEN || echo BLOCKED" \
    2>/dev/null | tr -d '\r\n'
}

# T1: korczewski -> mentolder shared-db must be blocked
RES_K2M=$(probe workspace-korczewski shared-db.workspace.svc.cluster.local 5432)
assert_eq "$RES_K2M" "BLOCKED" "SA-22" "T1" \
  "korczewski pod cannot reach mentolder shared-db (cross-brand isolation)"

# T2: mentolder -> korczewski shared-db must be blocked
RES_M2K=$(probe workspace shared-db.workspace-korczewski.svc.cluster.local 5432)
assert_eq "$RES_M2K" "BLOCKED" "SA-22" "T2" \
  "mentolder pod cannot reach korczewski shared-db (cross-brand isolation)"
