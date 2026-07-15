---
ticket_id: T001853
plan_ref: openspec/changes/k3d-dev-drift/tasks.md
status: active
date: 2026-07-15
---

# k3d-Basis-Drift: lokaler Dev-Cluster out-of-the-box deploybar — Design

## Problem

Der lokale k3d-Voll-Stack-Cluster (Kontext `k3d-korczewski-dev`, `task cluster:create` aus
`k3d-config.yaml`) ist mit `task workspace:deploy ENV=dev` nicht mehr lauffähig deploybar.
Die `k3d/`-Basis ist seit der Dev-Migration auf gekko-hetzner-2 (T001579) schleichend auf
den Remote-Cluster zugeschnitten worden — Host-Affinities, Fleet-CIDRs und Remote-Annahmen
sind in die Basis gewandert, die laut Architektur die umgebungsneutrale Dev-Basis ist.
Am 2026-07-15 wurde der Cluster vollständig live repariert (8 Findings, Ticket T001853);
alle Fixes sind imperativ (live-only) und driften beim nächsten Redeploy weg.

## Entscheidungen (Brainstorming 2026-07-15, mit User bestätigt)

1. **`ENV=dev` = current-context.** `workspace:deploy ENV=dev` deployt heute schon bewusst
   auf den aktuellen kubectl-Kontext. Diese Semantik wird verbindlich: die Basis muss auf
   jedem Single-Node-Cluster funktionieren (k3d lokal, gekko-hetzner-2-dev remote).
   `website:deploy ENV=dev` wird angeglichen (kein `--context=${ENV_CONTEXT}` im dev-Zweig).
   Kein neues Env-File, keine Änderung an `environments/dev.yaml` `context:` (der Eintrag
   dient weiter Remote-Ops, die ihn explizit nutzen).
2. **Pocket-ID-Bootstrap für alle Envs, idempotent.** `pocket-id-db-init` seedet Admin-User
   und `api_keys`-Row (`sha256(POCKET_ID_API_KEY)`) per `ON CONFLICT DO NOTHING` — auf Prod
   no-op, auf frischen Clustern automatischer Bootstrap (löst das Henne-Ei: Seed-Job braucht
   API-Key, Key entsteht sonst nur manuell in der UI).

## Root-Cause & Fix-Ansatz pro Finding

| # | Finding | Root-Cause | Fix |
|---|---------|-----------|-----|
| 1 | website/knowledge/systemtest-Manifeste unschedulbar auf k3d | `required` nodeAffinity auf Prod-/Remote-Hostnames in der Basis (`k3d/website.yaml`, `k3d/knowledge-ingest-cronjob.yaml`, `k3d/cronjob-systemtest-cleanup.yaml`) | Affinity ersatzlos aus der Basis entfernen. Auf Remote-Dev (1 Node) und Prod funktional äquivalent (Liste enthielt ohnehin alle Nodes); Prod-Pinning geht weiter über `WEBSITE_NODE_AFFINITY`-Patch in `website:deploy` bzw. Overlays. |
| 2 | Seed-Job-Write-back an k8s-API scheitert lokal | `allow-apiserver-egress` (in `k3d/network-policies.yaml`) erlaubt 6443 nur zu `10.20.0.0/24` (fleet-wg). Netpol wirkt post-DNAT → k3d-API-Endpoint liegt im Docker-Netz (172.16.0.0/12) | Neue dev-only Ressource `k3d/network-policies-dev.yaml` (`allow-apiserver-egress-k3d`: 6443 → 172.16.0.0/12), in `k3d/kustomization.yaml` registriert, im `prod/`-Overlay per `$patch: delete` gestrippt (etabliertes Muster wie `secrets.yaml`). |
| 3 | 5 CronJobs + brett curlen `website.website.svc` | Namespace-Literal statt `${WEBSITE_NAMESPACE}` (dev: `workspace-korczewski-dev`, prod-korczewski: `website-korczewski`!) | Literal durch `${WEBSITE_NAMESPACE}` ersetzen in `cronjob-scheduled-publish.yaml`, `notify-unread-cronjob.yaml`, `cronjob-dunning-detection.yaml`, `error-log-retention-cronjob.yaml`, `cronjob-monthly-billing.yaml`, `brett.yaml`. Variable ist in der envsubst-Liste von `workspace:deploy` bereits enthalten. **Behebt latenten prod-korczewski-Bug mit.** |
| 4 | Secret-Gaps | `k3d/secrets.yaml` fehlen `SESSIONS_CRON_TOKEN`, `STUDIO_DB_URL`; `k3d/website-dev-secrets.yaml` fehlen 12 referenzierte Keys + `namespace: website` hart kodiert; `domain-config` fehlt im Website-ns | Keys mit Dev-Werten ergänzen (Abgleich gegen die vom website-Deployment referenzierten `secretKeyRef`s). `website-dev-secrets.yaml` + `website-content-token-secret.yaml`: `namespace: ${WEBSITE_NAMESPACE}` + envsubst beim Apply in `website:deploy`. `website:deploy` dev-Zweig appliziert zusätzlich `configmap-domains.yaml` in den Website-ns. |
| 5 | `website:deploy ENV=dev` deployt Manifeste remote, importiert Image lokal | dev-Zweig setzt `CTX_ARG=--context=${ENV_CONTEXT}`; Image-Import nutzt `{{.CLUSTER_NAME}}` (lokal) | Im dev-Zweig `CTX_ARG=""` (current-context, konsistent zu `workspace:deploy`). |
| 6 | studio-Image nie nutzbar in dev | `studio:build`: `k3d image import -c ${CLUSTER_NAME:-k3d-dev}` — Shell-Var nie gesetzt, Fallback falsch, `\|\| true` verschluckt; Deployment: unqualifiziertes Image `studio-server` + `imagePullPolicy: Always` | Import auf `{{.CLUSTER_NAME}}` (Taskfile-Template-Var) umstellen, `\|\| true` entfernen; `imagePullPolicy: IfNotPresent` in `k3d/studio.yaml` (Basis = dev; Prod pinnt per Digest, Pull erfolgt dort ohnehin). |
| 7 | Pocket-ID ohne API-Key/User nicht seedbar | `api_keys`/`users` auf frischem Cluster leer; kein Bootstrap im Repo | `pocket-id-db-init`-Job: idempotentes SQL — Admin-User (feste UUID, `is_admin=true`) + `api_keys`-Row `seed-deploy` mit `encode(sha256($POCKET_ID_API_KEY::bytea),'hex')`, `ON CONFLICT DO NOTHING`. |
| 8 | API-Port-Drift bei jedem `k3d cluster start` | `k3d-config.yaml` pinnt `kubeAPI.host`, aber keinen `hostPort` | `kubeAPI.hostPort: "6445"` pinnen (wirkt ab nächster Cluster-Recreation; dokumentiert in Memory + Ticket). |

## Betroffene Subsysteme

- `k3d/`-Basis-Manifeste (website, brett, 5 CronJobs, knowledge-ingest, systemtest-cleanup, studio, network-policies, secrets, website-dev-secrets, pocket-id)
- `Taskfile.yml` (`website:deploy` dev-Zweig, `studio:build`)
- `k3d-config.yaml`
- `prod/kustomization.yaml` (neuer `$patch: delete` für die dev-Netpol)

## Edge-Cases

- **prod-korczewski CronJob-URLs ändern sich** (`website.website.svc` → `website.website-korczewski.svc`) — das ist die Korrektur eines latenten Bugs, muss aber im PR-Text stehen.
- **prod-mentolder**: `WEBSITE_NAMESPACE` default `website` → envsubst-Ergebnis identisch zum Status quo (no-op).
- Der Pocket-ID-Bootstrap darf **keine bestehenden Rows anfassen** (`ON CONFLICT DO NOTHING`, kein UPDATE) — Prod-User/Keys bleiben unberührt.
- `sha256()` ist PostgreSQL-builtin (v11+); shared-db ist PG16 — kein pgcrypto nötig.
- Affinity-Entfernung bei `cronjob-systemtest-cleanup.yaml` betrifft auch Prod: Liste enthielt alle 6 Prod-Nodes → required-Affinity war dort constraint-frei; Entfernung ist funktional äquivalent.
- Die live gepatchten Ressourcen auf dem k3d-Cluster werden beim nächsten `workspace:deploy ENV=dev` durch die dann korrekten Basis-Manifeste ersetzt (Konvergenz statt Drift).

## Verifikation

- Failing Tests (rot→grün) in `tests/spec/workspace-deploy.bats`: statische Guards gegen
  Host-Affinities in der Basis, `website.website.svc`-Literale, fehlende Secret-Keys,
  fehlenden dev-Netpol-Eintrag, `${CLUSTER_NAME:-k3d-dev}`-Shell-Fallback, fehlenden
  `kubeAPI.hostPort`, fehlendes Bootstrap-SQL.
- `task test:changed` + `task freshness:regenerate` + `task freshness:check`.
- Live-Verifikation nach Merge: frischer Redeploy auf den lokalen k3d (`workspace:deploy ENV=dev`
  mit current-context = `k3d-korczewski-dev`) muss ohne imperative Nacharbeit konvergieren.
