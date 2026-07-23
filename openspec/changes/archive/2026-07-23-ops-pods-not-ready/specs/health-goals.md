# health-goals — Delta-Spec (ops-pods-not-ready)

## Purpose

Ergänzt die Health-Goals-SSOT (`openspec/specs/health-goals.md`) um die statisch
prüfbare Regressionsabsicherung für G-OPS01 (Pods nicht Running/Ready, fleet,
beide Brand-Namespaces). Deckt zwei konkrete Root Causes aus der Live-Re-Messung
2026-07-23 ab: fehlende Secret-Keys in Brand-Secrets-Dateien und ungetrackte
Kubernetes-Deployments mit einer für ReadWriteOnce-Volumes unsicheren
Rollout-Strategie.

## ADDED Requirements

### Requirement: G-OPS01-STATIC-001 — Brand-Secrets-Dateien enthalten alle vom Deployment referenzierten workspace-secrets-Keys

Jeder `secretKeyRef.key` mit `name: workspace-secrets`, der in einem `k3d/*.yaml`
Deployment referenziert wird, muss in der plaintext-Secrets-Datei JEDES Brands
vorhanden sein, für das dieses Deployment ausgerollt wird (nicht nur im Brand,
in dem der Key ursprünglich angelegt wurde).

#### Scenario: oauth2-proxy-terminal erfordert POCKET_ID_TERMINAL_SECRET in beiden Brands
GIVEN `k3d/oauth2-proxy-terminal.yaml` referenziert `POCKET_ID_TERMINAL_SECRET`
  über `secretKeyRef` gegen `workspace-secrets`
WHEN `environments/.secrets/korczewski.yaml` und
  `environments/.secrets/fleet-korczewski.yaml` gelesen werden
THEN enthalten beide Dateien den Key `POCKET_ID_TERMINAL_SECRET`

### Requirement: G-OPS01-STATIC-002 — Deployments mit ReadWriteOnce-PVC-Mount nutzen keine RollingUpdate-Strategie

Jedes in `k3d/` getrackte Deployment, das ein `PersistentVolumeClaim`-Volume
mountet, deklariert `spec.strategy.type: Recreate`, damit ein Rollout nicht
versucht, einen zweiten Pod auf einem anderen Node zu starten, während der alte
Pod die ReadWriteOnce-PVC noch hält (das führt zu endlosem `ContainerCreating`
des neuen Pods).

#### Scenario: livekit-egress ist als Kustomize-Manifest getrackt und nutzt Recreate
GIVEN `k3d/livekit-egress.yaml` existiert und ist als Resource in
  `k3d/kustomization.yaml` registriert
WHEN das Deployment `livekit-egress` daraus geparst wird
THEN ist `spec.strategy.type` gleich `Recreate`
