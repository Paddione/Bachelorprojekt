---
title: "p5-ghcr-pull-secret — ghcr-pull-secret workspace-office/website-staging (T900036)"
ticket_id: T900036
domains: [fleet-operations]
status: active
target_files: ["environments/schema.yaml", "flux/clusters/fleet/bootstrap/ghcr-auth-sealedsecret.yaml", "k3d/office-stack/kustomization.yaml"]
---

# p5-ghcr-pull-secret — ghcr-pull-secret workspace-office/website-staging (T900036)

## Goal

`ghcr-pull-secret` (Docker-Registry-Secret) fehlt in `workspace-office` (collabora) und
`website-staging` (website). Aktuell laufen die Pods noch (Images gecacht), aber der naechste
Image-Pull schlaegt fehl (34355x / 98x FailedToRetrieveImagePullSecret). Das Secret muss in beiden
Namespaces provisioniert sein.

## Root-Cause / Befund

- Events: "FailedToRetrieveImagePullSecret (ghcr-pull-secret)" fuer `collabora-*` in
  `workspace-office` und `website-*` in `website-staging`.
- `flux/clusters/fleet/bootstrap/ghcr-auth-sealedsecret.yaml` ist streng an `flux-system`/
  `ghcr-auth` gebunden (nicht `ghcr-pull-secret`), dient dem OCI-Pull des Artefakts. Die Deployments
  referenzieren aber `ghcr-pull-secret` (anderer Name) — in den funktionierenden Namespaces wird dieses
  Secret separat provisioniert (k3d). In `workspace-office` und `website-staging` fehlt es.

## File Structure

```
environments/schema.yaml                              # MODIFIED: GHCR_PAT → ghcr-pull-secret für beide Namespaces (output_file je Namespace)
flux/clusters/fleet/bootstrap/ghcr-auth-sealedsecret.yaml  # REGENERATED/FIXT: ghcr-pull-secret Scoping (falls Schema-Mapping hierher zeigt)
k3d/office-stack/kustomization.yaml                   # MODIFIED: ghcr-pull-secret-Ressource für workspace-office
(via env:seal) SealedSecret ghcr-pull-secret für website-staging  # NEW
tests/spec/fleet-operations/ghcr-pull-secret.bats     # NEW (in p7): Guard
```

## Tasks

1. **Investigate:** Bestimmen, wie `ghcr-pull-secret` in den funktionierenden Namespaces
   provisioniert wird (k3d/kustomization + SealedSecret-Quelle; siehe k3d/brain.yaml, brett.yaml als
   Referenz — sie referenzieren `ghcr-pull-secret` und laufen). Das exakte Provisioning-Muster
   (SealedSecret pro Namespace via env:seal, StrictScope) extrahieren.
2. **Schema:** In `environments/schema.yaml` das Mapping fuer `ghcr-pull-secret` ergaenzen/verifizieren,
   sodass env:seal das Dockerconfigjson-SealedSecret fuer `workspace-office` und `website-staging`
   emittiert (Typ `kubernetes.io/dockerconfigjson`, Plaintext GHCR_USERNAME/GHCR_PAT aus
   `environments/.secrets/`). Zwei getrennte SealedSecrets mit je striktem Namespace-Scope.
3. **env:seal neu ausfuehren:** `task env:seal ENV=mentolder` (und ggf. staging) → SealedSecrets fuer
   beide Ziel-Namespaces regenerieren. Ergebnis committen.
4. **Kustomization:** `k3d/office-stack/kustomization.yaml` (und ggf. das Website-Staging-Kustomization)
   so ergaenzen, dass das `ghcr-pull-secret`-Objekt deployed wird. Falls das Secret nicht Teil des
   Artefakts sein soll, stattdessen die ImagePullSecret-Referenz auf das vorhandene provisioning
   Pattern legen.
5. **Verify:** `kubectl --context fleet -n workspace-office get secret ghcr-pull-secret` und
   `-n website-staging` existieren (Typ dockerconfigjson). Keine FailedToRetrieveImagePullSecret-Events
   mehr; frischer Image-Pull gelingt.

## Verify

Der BATS-Guard `ghcr-pull-secret.bats` prueft, dass die Manifests/SealedSecrets das Secret fuer beide
Namespaces deklarieren:

```bash
# Requirement: ghcr-pull-secret ist in workspace-office und website-staging vorhanden
# expected: FAIL (vor dem Fix fehlt das Secret in den Ziel-Namespaces)
tests/unit/lib/bats-core/bin/bats tests/spec/fleet-operations/ghcr-pull-secret.bats
```
