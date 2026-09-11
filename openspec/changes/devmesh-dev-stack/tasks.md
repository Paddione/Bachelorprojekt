---
title: "devmesh-dev-stack — Implementation Plan"
ticket_id: T900118
domains: [infra, testing, database, security]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: [devmesh-tailnet, devmesh-k3s-cluster]
---

# devmesh-dev-stack — Implementation Plan

_Ticket: T900118_ · Programm T900115 (ADR-008 SP-3) · blocked_by T900117 (SP-2)

Quellen: `proposal.md`, `design.md`, `specs/*.md` dieses Changes, ADR-008 Nachtrag 2026-09-11,
`.claude/skills/references/plan-quality-gates.md`.

**Reihenfolge.** `p5-tests` zuerst (RED), danach `p4-guard` und `p1-core`, dann `p2-full` und
`p3-deploy`. Die `depends_on`-Spalte bildet genau das ab. Jede Partial-Datei trennt
repo-seitige Tasks (zuerst) von markierten **Live-Tasks** am Ende. Live-Tasks setzen voraus,
dass SP-2 abgenommen ist: `task devmesh:status` meldet drei `Ready`-Knoten, drei
etcd-Mitglieder und einen Snapshot jünger als 6 Stunden.

**Vorbedingung repo-seitig.** SP-1 (`devmesh-tailnet`) und SP-2 (`devmesh-k3s-cluster`) sind
nach `main` gemergt. Sie legen `devmesh/inventory.yaml`, `taskfiles/Taskfile.devmesh.yml`
(Include `devmesh:` in `Taskfile.yml`) und `tests/spec/local-dev-mesh/` an; dieser Plan
ändert die ersten beiden nur additiv. Prüfung vor dem ersten Task:

```bash
git fetch origin main
git show origin/main:devmesh/inventory.yaml >/dev/null
git show origin/main:taskfiles/Taskfile.devmesh.yml >/dev/null
task --summary devmesh:kubeconfig >/dev/null   # Exit 0 = SP-2-Tasks sind eingebunden
```

**Abweichungen vom Proposal (bewusst).**
1. Sealing-Zertifikat heißt `environments/certs/dev.pem`, nicht `devmesh.pem`: `scripts/env-seal.sh`
   liest fest `${ENV_DIR}/certs/${ENV_NAME}.pem` (Z. 298), und das Environment bleibt `dev` (D2).
2. `scripts/ticket-mcp-node/` bekommt keinen eigenen Guard. `runner.mjs` führt jede Operation über
   `scripts/ticket.sh` aus (spawn, Z. 89); `server.mjs` hat keinen DB-Pfad. Der Guard in
   `ticket.sh` gilt damit auch für MCP; p5 belegt das über `runTicket`.
3. Kein DocuSeal-Component: im Repo existiert kein DocuSeal-Workload-Manifest
   (`grep -rln "name: docuseal" k3d prod prod-fleet` ist leer).
4. Keine Website-Code-Änderung. Die Degradierung ohne GPU liefert
   `components/website/src/pages/sdlc/api/llm-proxy/status.ts` bereits (`proxy: unreachable`
   plus `address`), `/api/health` hängt nicht am LLM.

## File Structure

```
dev-local/core/kustomization.yaml                  (neu, p1 — Profil core, Patches, Backup-Script-Generator)
dev-local/core/ingress.yaml                        (neu, p1 — web/auth/site/brett/mail.${DEVMESH_DOMAIN})
dev-local/core/gpu-endpoint.yaml                   (neu, p1 — Service llm-gateway-host + EndpointSlice)
dev-local/core/shared-db-backup.yaml               (neu, p1 — PVC + CronJob, storage=true)
scripts/devmesh/db-backup.sh                       (neu, p1 — pg_dumpall + 14-Tage-Pruning)
dev-local/full/kustomization.yaml                  (neu, p2 — core + Components)
dev-local/components/nextcloud/kustomization.yaml  (neu, p2)
dev-local/components/nextcloud/ingress.yaml        (neu, p2)
dev-local/components/collabora/kustomization.yaml  (neu, p2)
dev-local/components/collabora/ingress.yaml        (neu, p2)
dev-local/components/talk/kustomization.yaml       (neu, p2)
dev-local/components/talk/ingress.yaml             (neu, p2)
dev-local/components/vaultwarden/kustomization.yaml (neu, p2)
dev-local/components/vaultwarden/ingress.yaml      (neu, p2)
environments/dev.yaml                              (geändert, p3 — context devmesh, DEVMESH_*)
environments/schema.yaml                           (geändert, p3 — DEVMESH_DOMAIN, DEVMESH_PROFILE)
scripts/devmesh/render-stack.sh                    (neu, p3 — kustomize + envsubst aus der Arbeitskopie)
dev-local/cluster/tls.yaml                         (neu, p3 — ClusterIssuer, Wildcard-Certificate, TLSStore)
taskfiles/Taskfile.devmesh.yml                     (geändert, p3 — deploy, migrate, backup:run, status erweitert)
devmesh/inventory.yaml                             (geändert, p3 Live — tailnet_ip, gpu_endpoint)
environments/certs/dev.pem                         (neu, p3 Live — Sealing-Zertifikat devmesh)
environments/.secrets/dev.yaml                     (geändert, p3 Live — POCKET_ID_ENCRYPTION_KEY der Quelle)
environments/sealed-secrets/dev.yaml               (geändert, p3 Live — mit devmesh-Zertifikat neu versiegelt)
scripts/vda/ticket/_devmesh-guard.sh               (neu, p4 — Erkennung devmesh + Write-Verweigerung)
scripts/ticket.sh                                  (geändert, p4 — Guard vor Write-Befehlen)
scripts/vda/ticket/_ticket-core.sh                 (geändert, p4 — Guard in _exec_sql)
scripts/factory/lib.sh                             (geändert, p4 — Guard in factory_psql)
scripts/devmesh/migrate-from-k3d.sh                (neu, p4 — dump/restore/verify pocket_id + website)
tests/spec/local-dev-mesh/ticket-devmesh-guard.bats (neu, p5)
tests/spec/local-dev-mesh/migrate-from-k3d.bats    (neu, p5)
tests/spec/local-dev-mesh/dev-local-render.bats    (neu, p5)
tests/spec/local-dev-mesh/db-backup-retention.bats (neu, p5)
components/website/src/data/test-inventory.json    (regeneriert, p5)
```

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1-core | tasks.d/p1-core.md | impl | dev-local/core/kustomization.yaml, dev-local/core/ingress.yaml, dev-local/core/gpu-endpoint.yaml, dev-local/core/shared-db-backup.yaml, scripts/devmesh/db-backup.sh | p5-tests |
| p2-full | tasks.d/p2-full.md | impl | dev-local/full/kustomization.yaml, dev-local/components/nextcloud/kustomization.yaml, dev-local/components/nextcloud/ingress.yaml, dev-local/components/collabora/kustomization.yaml, dev-local/components/collabora/ingress.yaml, dev-local/components/talk/kustomization.yaml, dev-local/components/talk/ingress.yaml, dev-local/components/vaultwarden/kustomization.yaml, dev-local/components/vaultwarden/ingress.yaml | p1-core |
| p3-deploy | tasks.d/p3-deploy.md | impl | environments/dev.yaml, environments/schema.yaml, scripts/devmesh/render-stack.sh, dev-local/cluster/tls.yaml, taskfiles/Taskfile.devmesh.yml, devmesh/inventory.yaml, environments/certs/dev.pem, environments/.secrets/dev.yaml, environments/sealed-secrets/dev.yaml | p1-core |
| p4-guard | tasks.d/p4-guard.md | impl | scripts/vda/ticket/_devmesh-guard.sh, scripts/ticket.sh, scripts/vda/ticket/_ticket-core.sh, scripts/factory/lib.sh, scripts/devmesh/migrate-from-k3d.sh | p5-tests |
| p5-tests | tasks.d/p5-tests.md | tests | tests/spec/local-dev-mesh/ticket-devmesh-guard.bats, tests/spec/local-dev-mesh/migrate-from-k3d.bats, tests/spec/local-dev-mesh/dev-local-render.bats, tests/spec/local-dev-mesh/db-backup-retention.bats, components/website/src/data/test-inventory.json | |

## Verify

### Task V: Gesamtverifikation (repo-seitig, 45 min)

- [ ] **Step 1: Alle neuen BATS-Dateien grün.**

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/local-dev-mesh/
```

- [ ] **Step 2: Beide Overlays bauen, auch ohne Umgebung.**

```bash
kubectl kustomize --load-restrictor=LoadRestrictionsNone dev-local/core >/dev/null
kubectl kustomize --load-restrictor=LoadRestrictionsNone dev-local/full >/dev/null
bash scripts/devmesh/render-stack.sh core | kubectl apply --dry-run=client -f - >/dev/null
task workspace:validate
```

`render-stack.sh` braucht dafür eine gültige `gpu_endpoint`-Adresse im Inventar. Vor p3 Live-Task
L1 gilt das nur mit `DEVMESH_INVENTORY=<fixture>`; die BATS-Datei `dev-local-render.bats` deckt
den Fall ab.

- [ ] **Step 3: Bestehende Tests, die `environments/dev.yaml` lesen, bleiben grün.**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/fleet-operations/dev-env-split.bats \
  tests/spec/llm-pipeline.bats tests/spec/pocket-id-migration.bats tests/spec/auth-sso.bats \
  tests/spec/db-guard/kubeconfig-drift-guard.bats
tests/unit/lib/bats-core/bin/bats -r tests/spec/ticket-system/ tests/spec/ticket-mcp/ tests/spec/sdlc-isolation/
```

- [ ] **Step 4: Inventar und Pflicht-Gates.**

```bash
task test:inventory
git diff --stat components/website/src/data/test-inventory.json
task test:changed
task freshness:regenerate
task freshness:check
```
