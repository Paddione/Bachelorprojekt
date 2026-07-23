#!/usr/bin/env bats

# flux-validation.bats — Validate the Flux cluster CR layer (flux/clusters/fleet/).
#
# T002093 introduced an ExternalArtifact/ArtifactGenerator source layer that was
# never actually deployed (source-watcher operator/CRDs never installed) and had
# a broken sourceRef (FluxInstance.spec.sync.ref must be a string, not a map) that
# left flux-system's self-management stuck since it was merged. T002147 reverted
# the cluster CR layer to the OCIRepository source that render-fleet-artifact.yml
# (T002083) actually produces and that is verified working end-to-end.
#
# That source is named "fleet-manifests", not "flux-system": once the sync.ref fix
# let FluxInstance actually manage its own top-level sync resource, it created a
# GitRepository named "flux-system" (matching spec.sync.kind) and garbage-collected
# the pre-existing, imperatively-created OCIRepository of the same name — which every
# app Kustomization's sourceRef still pointed at. Recreating the OCIRepository under
# a name FluxInstance doesn't also want to own avoids the collision permanently.

setup() {
  cd "$(git rev-parse --show-toplevel)"
}

@test "Dev overlay is renderable" {
  run kustomize build prod-fleet/dev --load-restrictor=LoadRestrictionsNone 2>&1
  [ "$status" -eq 0 ]
}

@test "All brand Kustomizations depend on flux-infra-controllers" {
  for f in flux/clusters/fleet/ks-{mentolder,korczewski,website-mentolder,website-korczewski}.yaml; do
    run grep -q "flux-infra-controllers" "$f"
    [ "$status" -eq 0 ]
  done
}

@test "Brand/website/dev Kustomizations use OCIRepository/fleet-manifests source" {
  for f in flux/clusters/fleet/ks-{mentolder,korczewski,website-mentolder,website-korczewski,dev}.yaml; do
    run grep -q "kind: OCIRepository" "$f"
    [ "$status" -eq 0 ]
    run grep -q "name: fleet-manifests" "$f"
    [ "$status" -eq 0 ]
  done
}

@test "No sourceRef still points at the colliding flux-system OCIRepository name" {
  run grep -A1 "kind: OCIRepository" flux/clusters/fleet/ks-*.yaml
  [ "$status" -eq 0 ]
  ! printf '%s\n' "$output" | grep -q "name: flux-system$"
}

@test "fleet-manifests OCIRepository is committed with GHCR pull credentials" {
  [ -f flux/clusters/fleet/oci-source.yaml ]
  run grep -q "name: fleet-manifests" flux/clusters/fleet/oci-source.yaml
  [ "$status" -eq 0 ]
  run grep -q "url: oci://ghcr.io/paddione/fleet-manifests" flux/clusters/fleet/oci-source.yaml
  [ "$status" -eq 0 ]
  run grep -q "name: ghcr-auth" flux/clusters/fleet/oci-source.yaml
  [ "$status" -eq 0 ]
}

@test "Webhook receiver targets the renamed OCIRepository" {
  run grep -q "name: fleet-manifests" flux/clusters/fleet/bootstrap/receiver.yaml
  [ "$status" -eq 0 ]
}

@test "No ExternalArtifact sourceRef references remain in Kustomization CRDs" {
  run grep -r "kind: ExternalArtifact" flux/clusters/fleet/ks-*.yaml
  [ "$status" -ne 0 ]
}

@test "No flux-platform references remain" {
  run grep -r "flux-platform" flux/clusters/fleet/
  [ "$status" -ne 0 ]
}

@test "FluxInstance sync.ref is a plain string, not a nested ref object" {
  run grep -qE '^\s*ref: refs/heads/main\s*$' flux/clusters/fleet/flux-instance.yaml
  [ "$status" -eq 0 ]
  run grep -q "branch: main" flux/clusters/fleet/flux-instance.yaml
  [ "$status" -ne 0 ]
}

@test "FluxInstance does not enable the unused source-watcher component" {
  run grep -q "source-watcher" flux/clusters/fleet/flux-instance.yaml
  [ "$status" -ne 0 ]
  run grep -q "helm-controller" flux/clusters/fleet/flux-instance.yaml
  [ "$status" -eq 0 ]
}

@test "ArtifactGenerator/artifacts.yaml no longer exists" {
  [ ! -f flux/clusters/fleet/artifacts.yaml ]
  run grep -rq "kind: ArtifactGenerator" flux/clusters/fleet/
  [ "$status" -ne 0 ]
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

@test "Dependency chain: sealed-secrets (both brands) → infra-controllers" {
  run grep -q "flux-sealed-secrets-mentolder" flux/clusters/fleet/ks-infra-controllers.yaml
  [ "$status" -eq 0 ]
  run grep -q "flux-sealed-secrets-korczewski" flux/clusters/fleet/ks-infra-controllers.yaml
  [ "$status" -eq 0 ]
}

@test "flux-infra-configs (unrendered staging path) was removed, not left half-migrated" {
  [ ! -f flux/clusters/fleet/ks-infra-configs.yaml ]
}

@test "Sealed secrets are rendered into separate per-brand directories" {
  run grep -q "sealed-secrets/mentolder" scripts/flux-render-artifact.sh
  [ "$status" -eq 0 ]
  run grep -q "sealed-secrets/korczewski" scripts/flux-render-artifact.sh
  [ "$status" -eq 0 ]
}

@test "flux-sealed-secrets Kustomizations point at the separate per-brand paths" {
  run grep -q "path: ./sealed-secrets/mentolder" flux/clusters/fleet/ks-sealed-secrets.yaml
  [ "$status" -eq 0 ]
  run grep -q "path: ./sealed-secrets/korczewski" flux/clusters/fleet/ks-sealed-secrets.yaml
  [ "$status" -eq 0 ]
}
