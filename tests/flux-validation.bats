#!/usr/bin/env bats

# flux-validation.bats — Validate Flux gap-fill changes for T002093

setup() {
  cd "$(git rev-parse --show-toplevel)"
}

@test "Dev overlay is renderable" {
  run kustomize build prod-fleet/dev --load-restrictor=LoadRestrictionsNone 2>&1
  [ "$status" -eq 0 ]
}

@test "All brand Kustomizations depend on flux-infra-configs" {
  for f in flux/clusters/fleet/ks-{mentolder,korczewski,website-mentolder,website-korczewski}.yaml; do
    run grep -q "flux-infra-configs" "$f"
    [ "$status" -eq 0 ]
  done
}

@test "No OCIRepository references in Kustomization CRDs" {
  run grep -r "OCIRepository" flux/clusters/fleet/ks-*.yaml
  [ "$status" -ne 0 ]
}

@test "No flux-platform references remain" {
  run grep -r "flux-platform" flux/clusters/fleet/
  [ "$status" -ne 0 ]
}

@test "FluxInstance has all required components" {
  run grep -q "source-watcher" flux/clusters/fleet/flux-instance.yaml
  [ "$status" -eq 0 ]
  run grep -q "helm-controller" flux/clusters/fleet/flux-instance.yaml
  [ "$status" -eq 0 ]
}

@test "ArtifactGenerator exists" {
  [ -f flux/clusters/fleet/artifacts.yaml ]
  run grep -q "kind: ArtifactGenerator" flux/clusters/fleet/artifacts.yaml
  [ "$status" -eq 0 ]
}

@test "Notifications Provider and Alert exist" {
  [ -f flux/clusters/fleet/notifications.yaml ]
  run grep -q "kind: Provider" flux/clusters/fleet/notifications.yaml
  [ "$status" -eq 0 ]
  run grep -q "kind: Alert" flux/clusters/fleet/notifications.yaml
  [ "$status" -eq 0 ]
}

@test "Dev Flux Kustomization exists" {
  [ -f flux/clusters/fleet/ks-dev.yaml ]
  run grep -q "flux-dev" flux/clusters/fleet/ks-dev.yaml
  [ "$status" -eq 0 ]
}

@test "Dependency chain: sealed-secrets → infra-controllers → infra-configs" {
  run grep -q "flux-sealed-secrets" flux/clusters/fleet/ks-infra-controllers.yaml
  [ "$status" -eq 0 ]
  run grep -q "flux-infra-controllers" flux/clusters/fleet/ks-infra-configs.yaml
  [ "$status" -eq 0 ]
}

@test "Dev Kustomization uses ExternalArtifact/apps source" {
  run grep -q "ExternalArtifact" flux/clusters/fleet/ks-dev.yaml
  [ "$status" -eq 0 ]
  run grep -q "name: apps" flux/clusters/fleet/ks-dev.yaml
  [ "$status" -eq 0 ]
}
