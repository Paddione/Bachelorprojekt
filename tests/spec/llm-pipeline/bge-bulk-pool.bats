#!/usr/bin/env bats
# tests/spec/llm-pipeline/bge-bulk-pool.bats [T900993]
#
# PRÜFMODUS: Output-Verifikation gegen den gerenderten Kustomize-Build von
# `k3d/` (wie bge-thread-quota.bats) — nicht grep gegen den Quelltext.
#
# Vertrag des Bulk-Pools:
#   (a) Deployment bge-embed-bulk existiert, replicas: 0 (keine idle-Kosten).
#   (b) Pod-Labels enthalten app: bge-embed — nur so joinen Bulk-Pods den
#       Service llm-gateway-embed (Selector app: bge-embed) automatisch.
#   (c) Kein shared RWO-PVC (emptyDir) — sonst Recreate/Attach-Deadlock
#       (T002604) beim Hochskalieren.
#   (d) -t passt zur CPU-Quota (T002661-Regel, wie bge-embed).

setup_file() {
  export REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  export RENDERED="${BATS_FILE_TMPDIR}/k3d-rendered.yaml"
  kubectl kustomize "${REPO_ROOT}/k3d" >"${RENDERED}" 2>/dev/null || true
}

_bulk() {
  yq eval-all 'select(.kind == "Deployment" and .metadata.name == "bge-embed-bulk")' "${RENDERED}" 2>/dev/null
}

@test "bge-embed-bulk: existiert, parkt bei replicas 0" {
  [ -n "$(_bulk)" ]
  [ "$(_bulk | yq eval '.spec.replicas' - 2>/dev/null)" = "0" ]
}

@test "bge-embed-bulk: Pods tragen app=bge-embed (Service-Join)" {
  [ "$(_bulk | yq eval '.spec.template.metadata.labels.app' - 2>/dev/null)" = "bge-embed" ]
  [ "$(yq eval-all 'select(.kind == "Service" and .metadata.name == "llm-gateway-embed") | .spec.selector.app' "${RENDERED}" 2>/dev/null)" = "bge-embed" ]
}

@test "bge-embed-bulk: emptyDir statt RWO-PVC, -t passt zur CPU-Quota" {
  [ "$(_bulk | yq eval '.spec.template.spec.volumes[0].emptyDir | type' - 2>/dev/null)" != "null" ]
  [ "$(_bulk | yq eval '[.spec.template.spec.volumes[].persistentVolumeClaim] | map(select(. != null)) | length' - 2>/dev/null)" = "0" ]
  threads="$(_bulk | yq eval '.spec.template.spec.containers[] | select(.name == "llama-cpp") | .args[]' - 2>/dev/null | grep -A1 '^-t$' | tail -n1)"
  limit="$(_bulk | yq eval '.spec.template.spec.containers[] | select(.name == "llama-cpp") | .resources.limits.cpu' - 2>/dev/null)"
  [ "$threads" = "2" ]
  [ "$limit" = "2000m" ]
}
