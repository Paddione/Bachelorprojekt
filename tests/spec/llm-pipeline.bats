#!/usr/bin/env bats
# tests/spec/llm-pipeline.bats
# SSOT: openspec/specs/llm-pipeline.md
#
# Covers: LLM_ENABLED switch, embedding gateway, fail-closed on bge-m3 errors.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
}

# ── Embedding infrastructure ──────────────────────────────────────────

@test "embeddings.ts exists for embedding routing" {
  [ -f "$REPO/website/src/lib/embeddings.ts" ]
}

@test "embeddings.ts references LLM_ENABLED switch" {
  run grep -q 'LLM_ENABLED' "$REPO/website/src/lib/embeddings.ts"
  [ "$status" -eq 0 ]
}

@test "embeddings.ts routes through LLM gateway when LLM_ENABLED" {
  run grep -q 'llm-gateway' "$REPO/website/src/lib/embeddings.ts"
  [ "$status" -eq 0 ]
}

@test "embeddings.ts falls back to voyageai when LLM_ENABLED=false" {
  run grep -q 'voyageai\|voyage' "$REPO/website/src/lib/embeddings.ts"
  [ "$status" -eq 0 ]
}

# ── Fail-closed on GPU router errors ──────────────────────────────────

@test "embeddings.ts has error handling (EmbeddingQueryError or similar)" {
  run grep -qi 'EmbeddingQueryError\|EmbeddingIndexError\|throw.*Error\|catch' "$REPO/website/src/lib/embeddings.ts"
  [ "$status" -eq 0 ]
}

# ── Knowledge DB layer ────────────────────────────────────────────────

@test "knowledge-db.ts exists for pgvector operations" {
  [ -f "$REPO/website/src/lib/knowledge-db.ts" ]
}

# ── LLM_HOST_IP reachability from the k3d dev cluster [T002109] ────────
#
# The dev k3d cluster reaches the WSL host over the WireGuard mesh
# (192.168.100.0/24), the same address prod already uses. Docker bridge
# addresses do not work here: Docker Desktop runs its daemon in a separate
# docker-desktop distro, so no docker0/br-* interface exists in the working
# distro and k3d assigns a random per-cluster subnet.

dev_llm_host_ip() {
  grep -E '^\s*LLM_HOST_IP:' "$REPO/environments/dev.yaml" \
    | head -1 | sed -E 's/.*:\s*"?([0-9.]+)"?.*/\1/'
}

@test "dev LLM_HOST_IP is not a Docker bridge address" {
  local ip; ip="$(dev_llm_host_ip)"
  [ -n "$ip" ]
  # 172.16.0.0/12 covers docker0 (172.17.x) and every k3d-assigned subnet.
  if [[ "$ip" =~ ^172\.(1[6-9]|2[0-9]|3[01])\. ]]; then
    echo "LLM_HOST_IP=$ip is a Docker bridge address — unreachable from k3d pods" >&2
    return 1
  fi
}

@test "dev LLM_HOST_IP is inside the wg-mesh CIDR 192.168.100.0/24" {
  local ip; ip="$(dev_llm_host_ip)"
  [[ "$ip" =~ ^192\.168\.100\.[0-9]+$ ]]
}

@test "dev LLM_HOST_IP matches the GPU-host address used by prod envs" {
  local dev prod
  dev="$(dev_llm_host_ip)"
  prod="$(grep -E '^\s*LLM_HOST_IP:' "$REPO/environments/mentolder.yaml" \
    | head -1 | sed -E 's/.*:\s*"?([0-9.]+)"?.*/\1/')"
  [ "$dev" = "$prod" ]
}

@test "allow-llm-gateway-egress covers the CIDR that dev LLM_HOST_IP lives in" {
  run grep -q '192\.168\.100\.0/24' "$REPO/k3d/network-policies.yaml"
  [ "$status" -eq 0 ]
}
