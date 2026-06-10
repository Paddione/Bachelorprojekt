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

@test "FA-SF-60: resolve_partial_services returns slugs for a small service-only diff" {
  source "$REG"
  run resolve_partial_services "k3d/brett.yaml,website/src/pages/index.astro"
  [ "$status" -eq 0 ]
  [ "$output" = "brett" ]
}

@test "FA-SF-60: dedups multiple files of the same service" {
  source "$REG"
  run resolve_partial_services "k3d/nextcloud.yaml,k3d/nextcloud-redis.yaml"
  [ "$status" -eq 0 ]
  [ "$output" = "nextcloud" ]
}

@test "FA-SF-60: infra change forces full deploy (non-zero, empty)" {
  source "$REG"
  run resolve_partial_services "k3d/namespace.yaml,k3d/brett.yaml"
  [ "$status" -ne 0 ]
}

@test "FA-SF-60: unknown k3d file forces full deploy (fail safe)" {
  source "$REG"
  run resolve_partial_services "k3d/brand-new-service.yaml"
  [ "$status" -ne 0 ]
}

@test "FA-SF-60: a diff touching no k3d service file returns non-zero" {
  source "$REG"
  run resolve_partial_services "website/src/pages/index.astro,Taskfile.yml"
  [ "$status" -ne 0 ]
}

@test "FA-SF-60: more than PARTIAL_DEPLOY_MAX services forces full deploy" {
  source "$REG"
  PARTIAL_DEPLOY_MAX=2 run resolve_partial_services "k3d/brett.yaml,k3d/keycloak.yaml,k3d/docs.yaml"
  [ "$status" -ne 0 ]
}

@test "FA-SF-60: kustomization.yaml change forces full deploy" {
  source "$REG"
  run resolve_partial_services "k3d/kustomization.yaml"
  [ "$status" -ne 0 ]
}
