## ADDED Requirements

### Requirement: Traefik Service Preserves Real Client IP

The shared `kube-system/traefik` Service SHALL be configured so that backend
services behind Traefik (e.g. Pocket ID) observe the real external client IP
address instead of a cluster-internal pseudo-IP, so that per-client
rate-limiting and audit logging operate correctly.

#### Scenario: Traefik values declare externalTrafficPolicy Local

- **GIVEN** the repo-tracked `prod/traefik-values.yaml` Helm values file for
  the fleet's shared Traefik release
- **WHEN** the file is inspected
- **THEN** `service.spec.externalTrafficPolicy` is `Local`
- **AND** `deployment.kind` is `DaemonSet`

#### Scenario: Traefik DaemonSet topology covers every public entry node

- **GIVEN** `prod/traefik-values.yaml` sets `externalTrafficPolicy: Local`
  (which causes kube-proxy to drop Service traffic on any node lacking a
  local backend pod)
- **WHEN** the node affinity in the same file is inspected
- **THEN** it matches exactly the three public Hetzner nodes that DNS for
  `*.${PROD_DOMAIN}` resolves to (`pk-hetzner-4`, `pk-hetzner-6`,
  `pk-hetzner-8`)

#### Scenario: Future full-cluster bootstrap installs the tracked values file

- **GIVEN** `prod/cloud-init.yaml` (used to bootstrap a brand-new fleet
  cluster from scratch)
- **WHEN** the Traefik Helm install step is inspected
- **THEN** it installs from the repo-tracked `prod/traefik-values.yaml`
  (fetched via `curl`) rather than inline `--set` flags, so a fresh
  full-cluster rebuild does not regress to the old (real-IP-losing) default
  `externalTrafficPolicy: Cluster` behavior

#### Scenario: No orphaned/unused Traefik values files remain

- **GIVEN** the repo previously contained an unused
  `prod-korczewski/traefik-values.yaml` (zero references anywhere in the
  repo, never wired into any install/upgrade path)
- **WHEN** the repo is inspected after this change
- **THEN** that file no longer exists — its intent is consolidated into the
  single, actually-applied `prod/traefik-values.yaml`
