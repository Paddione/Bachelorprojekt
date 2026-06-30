#!/usr/bin/env bats
# tests/spec/pocket-id-proxy-ip.bats
# SSOT: openspec/changes/pocket-id-proxy-ip-rate-limit/tasks.md (T001328)
#
# Verifies that the Traefik IngressRoute for Pocket-ID is configured with
# forwardedHeaders.trustedIPs so the real client IP reaches Pocket-ID for
# rate-limiting and audit logging, rather than the cluster-internal proxy IP.
#
# Run: tests/unit/lib/bats-core/bin/bats tests/spec/pocket-id-proxy-ip.bats
# or:  task test:unit SPEC=pocket-id-proxy-ip

REPO_ROOT="${REPO_ROOT:-$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)}"
K3D="${REPO_ROOT}/k3d"

setup() {
  load 'test_helper'
}

@test "pocket-id-proxy: k3d/pocket-id.yaml IngressRoute has forwardedHeaders" {
  grep -q 'forwardedHeaders' "${K3D}/pocket-id.yaml"
}

@test "pocket-id-proxy: forwardedHeaders trusts Pod-CIDR (10.42.0.0/16)" {
  grep -q '10\.42\.0\.0/16' "${K3D}/pocket-id.yaml"
}

@test "pocket-id-proxy: forwardedHeaders trusts Service-CIDR (10.43.0.0/16)" {
  grep -q '10\.43\.0\.0/16' "${K3D}/pocket-id.yaml"
}

@test "pocket-id-proxy: kustomize build k3d/ emits forwardedHeaders for pocket-id IngressRoute" {
  local out
  out=$(kustomize build "${K3D}" --load-restrictor=LoadRestrictionsNone 2>/dev/null)
  echo "$out" | awk '
    BEGIN{in_ir=0; found=0}
    /^---$/{if(in_ir && found){print "found"; exit} in_ir=0; found=0}
    /^kind: IngressRoute$/{in_ir=1}
    in_ir && /forwardedHeaders:/{found=1}
    END{exit found?0:1}
  '
}

@test "pocket-id-proxy: TRUST_PROXY env is set (accepts X-Forwarded-For)" {
  grep -q 'TRUST_PROXY' "${K3D}/pocket-id.yaml"
}
