#!/usr/bin/env bats
# FA-SF-60: structural contract for partial-deploy (offline, no cluster).
#   - service-registry.sh maps EVERY k3d/*.yaml to a slug or INFRA
#   - infra files are never partial-deployable
#   - resolve_partial_services applies the ≤5 / no-infra threshold
#   - Taskfile exposes workspace:partial-deploy
REG="scripts/factory/service-registry.sh"
setup() { load 'test_helper.bash'; }

@test "FA-SF-60: service-registry.sh exists and passes bash -n" {
  [ -f "$REG" ]
  run bash -n "$REG"
  [ "$status" -eq 0 ]
}

@test "FA-SF-60: every k3d/*.yaml is classified (registry slug OR infra)" {
  # shellcheck disable=SC1090
  source "$REG"
  local missing=()
  for f in k3d/*.yaml; do
    # kustomization.yaml is the kustomize entrypoint, not a deployable resource
    [ "$f" = "k3d/kustomization.yaml" ] && continue
    if [ -n "${SERVICE_REGISTRY[$f]:-}" ]; then continue; fi
    local is_infra=0
    for inf in "${INFRA_FILES[@]}"; do [ "$inf" = "$f" ] && is_infra=1 && break; done
    [ "$is_infra" -eq 1 ] || missing+=("$f")
  done
  if [ "${#missing[@]}" -ne 0 ]; then
    printf 'UNCLASSIFIED: %s\n' "${missing[@]}" >&2
  fi
  [ "${#missing[@]}" -eq 0 ]
}
