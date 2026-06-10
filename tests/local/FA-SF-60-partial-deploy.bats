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

@test "FA-SF-60: every registry slug appears as an app: label in the kustomize build" {
  command -v kustomize >/dev/null || skip "kustomize not installed"
  source "$REG"
  local built; built=$(kustomize build k3d/ --load-restrictor=LoadRestrictionsNone 2>/dev/null) || skip "kustomize build failed offline"
  local missing=()
  local seen=()
  # unique slug set — only check slugs whose files appear in kustomization.yaml
  local kustomization; kustomization=$(cat k3d/kustomization.yaml)
  local slug
  for f in "${!SERVICE_REGISTRY[@]}"; do
    # skip files not referenced by kustomization.yaml (deployed separately by workspace:deploy)
    local basename="${f##k3d/}"
    printf '%s' "$kustomization" | grep -qF "$basename" || continue
    slug="${SERVICE_REGISTRY[$f]}"
    printf '%s\n' "${seen[@]}" | grep -qx "$slug" && continue
    seen+=("$slug")
    grep -Eq "app: ${slug}( |$)" <<< "$built" || missing+=("$slug")
  done
  if [ "${#missing[@]}" -ne 0 ]; then
    printf 'SLUG WITH NO app: LABEL IN BUILD: %s\n' "${missing[@]}" >&2
  fi
  [ "${#missing[@]}" -eq 0 ]
}

@test "FA-SF-60: Taskfile defines workspace:partial-deploy" {
  run grep -Eq '^  workspace:partial-deploy:' Taskfile.yml
  [ "$status" -eq 0 ]
}

@test "FA-SF-60: partial-deploy uses a label selector apply (app in (...))" {
  # the rendered apply must filter by the PARTIAL_SERVICES label set
  run grep -Eq 'app in \(' Taskfile.yml
  [ "$status" -eq 0 ]
}

@test "FA-SF-60: partial-deploy aborts when PARTIAL_SERVICES is empty" {
  run grep -Eq 'PARTIAL_SERVICES.*(required|must be set|empty)' Taskfile.yml
  [ "$status" -eq 0 ]
}

@test "FA-SF-60: pipeline.js references the service-registry resolver" {
  run grep -q 'resolve_partial_services' scripts/factory/pipeline.js
  [ "$status" -eq 0 ]
  run grep -q 'service-registry.sh' scripts/factory/pipeline.js
  [ "$status" -eq 0 ]
}

@test "FA-SF-60: pipeline.js passes node --check" {
  command -v node >/dev/null || skip "node not installed"
  run node --check scripts/factory/pipeline.js
  [ "$status" -eq 0 ]
}

@test "FA-SF-60: the registry resolver invoked the JS way yields a slug for a service-only diff" {
  run bash -c 'source scripts/factory/service-registry.sh && resolve_partial_services "k3d/brett.yaml"'
  [ "$status" -eq 0 ]
  [ "$output" = "brett" ]
}
