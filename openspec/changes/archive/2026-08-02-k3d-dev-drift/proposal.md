# Proposal: k3d-dev-drift

## Why

Die `k3d/`-Basis ist laut Architektur die umgebungsneutrale Dev-Basis, wurde aber seit der
Dev-Migration auf gekko-hetzner-2 (T001579) schleichend auf den Remote-Cluster zugeschnitten:
Host-Affinities, Fleet-CIDRs, Namespace-Literale und Remote-Kontext-Annahmen sind in Basis
und Taskfile gewandert. Ein frischer lokaler k3d-Cluster (`task cluster:create` +
`task workspace:deploy ENV=dev`) landet dadurch in Massen-`CreateContainerConfigError`,
unschedulbaren Pods und einem nicht seedbaren Pocket-ID. Am 2026-07-15 wurde der Cluster
live repariert (Ticket T001853, 8 Findings) — alle Fixes sind imperativ und driften beim
nächsten Redeploy weg. Nebenbefund: Die `website.website.svc`-Literale in 5 CronJobs sind
auf prod-korczewski (Namespace `website-korczewski`) ein latenter Bug.

## What

Die 8 Findings aus T001853 werden in Basis, Overlays und Taskfile zurückgeführt, sodass
`ENV=dev` auf jedem Single-Node-Cluster (lokaler k3d, Remote-Dev) ohne Handarbeit
konvergiert — verbindliche Semantik: **`ENV=dev` deployt auf den aktuellen kubectl-Kontext**.

1. Host-Affinities raus aus der Basis (`website.yaml`, `knowledge-ingest-cronjob.yaml`, `cronjob-systemtest-cleanup.yaml`).
2. Dev-only NetworkPolicy `allow-apiserver-egress-k3d` (6443 → 172.16.0.0/12), von `prod/` per `$patch: delete` gestrippt.
3. `website.website.svc` → `website.${WEBSITE_NAMESPACE}.svc` in 5 CronJobs + `brett.yaml`.
4. Dev-Secret-Gaps schließen (`k3d/secrets.yaml`, `k3d/website-dev-secrets.yaml` inkl. `namespace: ${WEBSITE_NAMESPACE}`), `domain-config` in den Website-ns.
5. `website:deploy` dev-Zweig auf current-context (kein `--context=${ENV_CONTEXT}`).
6. `studio:build`-Import auf `{{.CLUSTER_NAME}}`, `imagePullPolicy: IfNotPresent` in `k3d/studio.yaml`.
7. Idempotenter Pocket-ID-Bootstrap (Admin-User + `seed-deploy`-API-Key) in `pocket-id-db-init` — alle Envs, `ON CONFLICT DO NOTHING`.
8. `kubeAPI.hostPort` in `k3d-config.yaml` pinnen.

Design-Spec: `docs/superpowers/specs/2026-07-15-k3d-dev-drift-design.md`

_Ticket: T001853_
