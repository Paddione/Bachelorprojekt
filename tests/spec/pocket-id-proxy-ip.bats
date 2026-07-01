#!/usr/bin/env bats
# tests/spec/pocket-id-proxy-ip.bats
# SSOT: openspec/specs/workspace-deploy.md
# History: openspec/changes/pocket-id-proxy-ip-rate-limit/tasks.md (T001328)
#          openspec/changes/pocket-id-ingressroute-schema-drift/tasks.md (T001397)
#
# T001328 added `spec.forwardedHeaders.trustedIPs` to the Pocket-ID
# IngressRoute to fix Pocket-ID's rate-limiter/audit-log seeing the
# cluster-internal proxy IP instead of the real client IP. That field was
# placed on the wrong CRD object: `forwardedHeaders` has never been a valid
# `IngressRoute` field for any Traefik version (confirmed against the live
# `fleet` cluster's installed `ingressroutes.traefik.io` CRD, which only
# declares `entryPoints`, `parentRefs`, `routes`, `tls`) — it only exists as
# Traefik's static/entry-point config. `kubectl apply --server-side` (used by
# `task workspace:deploy`) validates against that schema and rejected the
# field, aborting the whole apply chain and blocking every future deploy to
# both brands (T001397).
#
# Separately, T001341 (traefik-hostport-clientip) already fixed the
# underlying problem this field was chasing: Traefik now binds hostPort
# 80/443 directly with klipper-lb removed, so there is no SNAT hop left to
# correct for — the real client IP already reaches Pocket-ID without needing
# to trust any upstream X-Forwarded-For header.
#
# This spec now verifies the field stays removed and the rendered manifest
# stays schema-clean, while TRUST_PROXY (Pocket-ID's own Express-level
# trust-proxy setting, unrelated to the Traefik CRD) remains required.
#
# Run: tests/unit/lib/bats-core/bin/bats tests/spec/pocket-id-proxy-ip.bats
# or:  task test:unit SPEC=pocket-id-proxy-ip

REPO_ROOT="${REPO_ROOT:-$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)}"
K3D="${REPO_ROOT}/k3d"

setup() {
  load 'test_helper'
}

@test "pocket-id-proxy: k3d/pocket-id.yaml IngressRoute has no forwardedHeaders (invalid CRD field)" {
  ! grep -q 'forwardedHeaders' "${K3D}/pocket-id.yaml"
}

@test "pocket-id-proxy: kustomize build k3d/ emits no forwardedHeaders on any IngressRoute" {
  local out
  out=$(kustomize build "${K3D}" --load-restrictor=LoadRestrictionsNone 2>/dev/null)
  echo "$out" | awk '
    BEGIN{in_ir=0; found=0}
    /^---$/{if(in_ir && found){print "found"; exit} in_ir=0; found=0}
    /^kind: IngressRoute$/{in_ir=1}
    in_ir && /forwardedHeaders:/{found=1}
    END{exit found?1:0}
  '
}

@test "pocket-id-proxy: TRUST_PROXY env is set (accepts X-Forwarded-For)" {
  grep -q 'TRUST_PROXY' "${K3D}/pocket-id.yaml"
}
