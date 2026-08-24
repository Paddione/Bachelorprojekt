#!/usr/bin/env bats
# tests/spec/fleet-operations/internal-endpoints.bats
# SSOT: openspec/changes/wsl-exit-internal-endpoints/specs/fleet-operations.md [T016430]

setup() {
  load '../test_helper.bash'
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
}

@test "bge hosts are centrally registered (schema + configmap + prod overlay)" {
  grep -q "name: BGE_EMBED_HOST" "${REPO_ROOT}/environments/schema.yaml"
  grep -q "name: BGE_RERANK_HOST" "${REPO_ROOT}/environments/schema.yaml"
  grep -q 'BGE_EMBED_HOST: "embed.localhost"' "${REPO_ROOT}/k3d/configmap-domains.yaml"
  grep -q 'BGE_EMBED_HOST: "bge-embed.mentolder.de"' "${REPO_ROOT}/environments/fleet-mentolder.yaml"
  grep -q 'BGE_RERANK_HOST: "bge-rerank.mentolder.de"' "${REPO_ROOT}/environments/fleet-mentolder.yaml"
  grep -q 'bge-embed.mentolder.de' "${REPO_ROOT}/prod-fleet/mentolder/bge-hosts-patch.yaml"
  grep -q 'bge-rerank.mentolder.de' "${REPO_ROOT}/prod-fleet/mentolder/bge-hosts-patch.yaml"
}

@test "bge ingress routes are wg-whitelisted in dev and prod" {
  # Base (k3d) definiert Middleware+Routes; Prod-Patch tauscht nur die Hosts.
  for f in k3d/llm-gateway-ingress.yaml prod-fleet/mentolder/bge-hosts-patch.yaml; do
    local file="${REPO_ROOT}/${f}"
    [ -f "$file" ]
    if [ "$f" = "prod-fleet/mentolder/bge-hosts-patch.yaml" ]; then
      # Middleware 'wg-only' wird einmalig im k3d-Base definiert und hier nur referenziert.
      if ! grep -q "name: wg-only" "$file"; then echo "$f missing wg-only ref"; return 1; fi
    else
      if ! grep -q "ipWhiteList" "$file"; then echo "$f missing ipWhiteList"; return 1; fi
      if ! grep -q "192.168.100.0/24" "$file"; then echo "$f missing wg CIDR"; return 1; fi
    fi
    if ! grep -q "llm-gateway-embed" "$file"; then echo "$f missing embed ref"; return 1; fi
    if ! grep -q "llm-gateway-rerank" "$file"; then echo "$f missing rerank ref"; return 1; fi
  done
}

@test "no manifest exposes shared-db 5432 on public entrypoints or NodePort/LB" {
  # Die Policy-Datei dokumentiert nur die Verbote (Begriffsvorkommen in
  # Kommentaren) und wird bewusst ausgenommen.
  local hits
  hits=$(grep -rl --include="*.yaml" "shared-db" "${REPO_ROOT}/k3d" "${REPO_ROOT}/prod-fleet" \
    | grep -v "shared-db-endpoint-policy.yaml" \
    | grep -v "/dev-stack/" \
    | xargs -r grep -lE "(type: (NodePort|LoadBalancer))|IngressRouteTCP" 2>/dev/null || true)
  if [ -n "$hits" ]; then
    echo "public exposure candidates:"; echo "$hits"; return 1
  fi
}

@test "endpoint policy configmap documents the sish transport for external db consumers" {
  local f="${REPO_ROOT}/k3d/shared-db-endpoint-policy.yaml"
  [ -f "$f" ]
  grep -q "no-public-exposure" "$f"
  grep -qi "sish" "$f"
}
