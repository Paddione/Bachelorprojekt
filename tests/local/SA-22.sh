#!/usr/bin/env bash
# SA-22: Cross-brand isolation on the fleet cluster with the ADR-012 exception
# (T901440) — the central shared-db (ns workspace) serves website_massage and
# pocket_id_korczewski, so website-korczewski and workspace-korczewski are
# explicitly allowed to reach it on 5432. Everything else stays isolated:
# foreign namespaces must NOT reach the central DB, and the frozen
# korczewski-own endpoint stays unreachable.
#
# NOTE: numbered SA-22 (not SA-08 as the plan/spec drafted) — SA-08 is the
# existing Keycloak OIDC SSO test. Highest prior SA id is SA-21.
#
# T1: website-korczewski pod -> central shared-db:5432    must be OPEN (ADR-012)
# T2: workspace-korczewski pod -> central shared-db:5432 must be OPEN (ADR-012)
# T3: foreign-ns (default) pod -> central shared-db:5432 must be BLOCKED
# T4: workspace-korczewski pod -> frozen own shared-db:5432 must be BLOCKED
#
# A BLOCKED verdict only counts after successful pod start, DNS resolution and
# a positive anchor (T1/T2 OPEN in the same run). API/image/DNS errors are
# reported, never counted as isolation success. Probe pods are removed via --rm.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"

CTX="${FLEET_CONTEXT:-fleet}"
KUBECTL="kubectl --context ${CTX}"

# Probe TCP reachability from a throwaway busybox pod. Prints OPEN or BLOCKED.
# A 4s nc timeout means a NetworkPolicy drop surfaces as BLOCKED, not a hang.
# Labels document the workload role; the effective ingress/egress selectors are
# namespace-based (allow-website-to-shared-db-ingress, allow-egress-to-workspace).
probe() {  # probe <from-ns> <label> <target-fqdn> <port>
  local from_ns="$1" label="$2" target="$3" port="$4" name="netcheck-${RANDOM}"
  $KUBECTL run "$name" -n "$from_ns" --rm -i --restart=Never \
    --labels="sa-22-probe=${label}" \
    --image=busybox:1.36 --quiet -- \
    sh -c "nc -z -w4 ${target} ${port} >/dev/null 2>&1 && echo OPEN || echo BLOCKED" \
    2>/tmp/sa-22-probe-err.log | tr -d '\r\n'
}

# Resolve a FQDN from a throwaway pod. Prints OK or FAIL (never counted as isolation).
dns_ok() {  # dns_ok <from-ns> <target-fqdn>
  local from_ns="$1" target="$2" name="dnscheck-${RANDOM}"
  if $KUBECTL run "$name" -n "$from_ns" --rm -i --restart=Never \
    --image=busybox:1.36 --quiet -- \
    nslookup "$target" >/dev/null 2>/tmp/sa-22-dns-err.log; then
    echo "OK"
  else
    echo "FAIL"
  fi
}

CENTRAL="shared-db.workspace.svc.cluster.local"
FROZEN_OWN="shared-db.workspace-korczewski.svc.cluster.local"

# T1+T2: positive anchors — allowed namespaces must reach the central DB.
RES_W2C=$(probe website-korczewski website "$CENTRAL" 5432)
assert_eq "$RES_W2C" "OPEN" "SA-22" "T1" \
  "website-korczewski pod reaches central shared-db (ADR-012 exception)"

RES_P2C=$(probe workspace-korczewski pocket-id "$CENTRAL" 5432)
assert_eq "$RES_P2C" "OPEN" "SA-22" "T2" \
  "workspace-korczewski pod reaches central shared-db (ADR-012 exception)"

# T3: foreign namespace must be blocked — only with DNS OK + positive anchor.
DNS_FOREIGN=$(dns_ok default "$CENTRAL")
if [ "$DNS_FOREIGN" != "OK" ]; then
  echo "SA-22 T3: DNS resolution failed — no isolation verdict (see /tmp/sa-22-dns-err.log)"
  exit 1
fi
if [ "$RES_W2C" != "OPEN" ] && [ "$RES_P2C" != "OPEN" ]; then
  echo "SA-22 T3: no positive anchor (T1/T2 not OPEN) — BLOCKED would prove nothing"
  exit 1
fi
RES_F2C=$(probe default foreign "$CENTRAL" 5432)
assert_eq "$RES_F2C" "BLOCKED" "SA-22" "T3" \
  "foreign-ns pod cannot reach central shared-db (cross-brand isolation)"

# T4: frozen own endpoint stays unreachable.
DNS_FROZEN=$(dns_ok workspace-korczewski "$FROZEN_OWN")
if [ "$DNS_FROZEN" != "OK" ]; then
  echo "SA-22 T4: frozen endpoint DNS does not resolve (scaled to 0) — endpoint absent, nothing to isolate"
else
  RES_K2K=$(probe workspace-korczewski pocket-id "$FROZEN_OWN" 5432)
  assert_eq "$RES_K2K" "BLOCKED" "SA-22" "T4" \
    "korczewski pod cannot reach frozen own shared-db"
fi
