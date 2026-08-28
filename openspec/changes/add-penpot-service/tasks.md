---
title: "add-penpot-service — Implementation Plan"
ticket_id: T016593
domains: [plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# add-penpot-service — Implementation Plan

_Ticket: T016434_

## File Structure

```
k3d/penpot.yaml                                 # NEU: Penpot Deployment (Backend/Frontend/Gateway als Container) + MinIO Deployment + PVCs
k3d/penpot-ingress.yaml                         # NEU: IngressRoute design.* → penpot-gateway
k3d/configmap-domains.yaml                      # MODIFIED: PENPOT_DOMAIN, PENPOT_IMAGE_*
k3d/shared-db.yaml                              # MODIFIED: penpot Role + DB erstellen
k3d/pocket-id-client-seed.yaml                  # MODIFIED: POCKET_ID_PENPOT_SECRET + Client-Provisionierung
k3d/secrets.yaml                                # MODIFIED: PENPOT_DB_PASSWORD, POCKET_ID_PENPOT_SECRET
components/website/src/lib/admin/nav-items.ts   # MODIFIED: Penpot in "Werkzeuge"-Sektion
prod-fleet/mentolder/penpot-ingress-route.yaml  # NEU: Prod IngressRoute für design.<domain>
prod-fleet/korczewski/penpot-ingress-route.yaml # NEU: Prod IngressRoute für design.<domain>
Taskfile.yml                                    # MODIFIED: PENPOT_DOMAIN in beiden ENVSUBST_VARS-Listen
tests/spec/auth-sso/penpot-oidc.bats            # NEU: Pocket-ID-Client-Provisionierung
tests/spec/fleet-operations/penpot-manifests.bats  # NEU: Manifest-Validierung + Domain-Keys
```

## Tasks

- [x] **Domain-Registry erweitern.** `PENPOT_DOMAIN` in `k3d/configmap-domains.yaml` (dev: `design.localhost`); Prod-Werte brand-neutral via `prod/configmap-domains.yaml` + envsubst aus der Env-Registry. Images: `PENPOT_IMAGE_BACKEND` und `PENPOT_IMAGE_FRONTEND` (Muster: `DOCS_IMAGE`). `PENPOT_DOMAIN` auch in `environments/schema.yaml` + allen `environments/*.yaml` + `prod/configmap-domains.yaml` + `k3d/website.yaml`.

- [x] **shared-db Penpot-Role anlegen.** `k3d/shared-db.yaml`: Penpot-User `penpot` erstellen, Datenbank `penpot` anlegen, Passwort aus `PENPOT_DB_PASSWORD` Secret syncen. Muster: Vaultwarden-Setup in Zeile 38–52.

- [x] **Secrets anlegen.** `k3d/secrets.yaml`: `PENPOT_DB_PASSWORD`, `POCKET_ID_PENPOT_SECRET`, `PENPOT_SECRET_KEY`, `PENPOT_MINIO_SECRET_KEY`. Muster: `VAULTWARDEN_DB_PASSWORD` / `POCKET_ID_VAULTWARDEN_SECRET`.

- [x] **Penpot Deployment erstellen.** `k3d/penpot.yaml` — Hauptmanifest:
  - Pod mit 3 Containern: `penpot-backend` (Java/Tomcat, 256Mi/100m requests, 512Mi/500m limits), `penpot-frontend` (ClojureScript, 128Mi/50m, 512Mi/250m), `penpot-gateway` (Nginx, 64Mi/25m, 128Mi/100m)
  - Init-Container `wait-for-db` (wie Vaultwarden), `wait-for-minio`
  - Env: DATABASE_URL zu `shared-db:5432`, MinIO Endpoint, Pocket-ID OIDC config (`PENPOT_OIDC_*`-Vars zu `pocket-id:1411`)
  - MinIO Deployment im selben File: 1 Replica, 512MB RAM, PVC `penpot-minio-pvc` (5Gi), image `minio/minio:RELEASE.2024-11-22T13-35-48Z`
  - Services: `penpot-gateway` (Port 80 → targetPort 80), `penminio` (9000, 9001)
  - Health-Checks: Backend `/api/health`, Gateway `/`

- [x] **IngressRoute erstellen.** `k3d/penpot-ingress.yaml`: Regel für `design.localhost` → `penpot-gateway:80`. In `k3d/ingress.yaml` als separate Datei (Muster: `vault.localhost` → `vaultwarden` im Haupt-Ingress, `docs.localhost` → `oauth2-proxy-docs` im internal-Ingress). Penpot ist direkt erreichbar (kein oauth2-proxy).

- [x] **Fleet-Overlays für Prod.** `prod-fleet/mentolder/penpot-ingress-route.yaml` und `prod-fleet/korczewski/penpot-ingress-route.yaml`: TLS mit Wildcard-Cert, Host `design.<PROD_DOMAIN>`. `PENPOT_DOMAIN` kommt aus `environments/<brand>.yaml` und wird von `workspace:deploy` bzw. `flux:render` per envsubst in `prod/configmap-domains.yaml` eingesetzt — kein per-Brand-Patch (S3-Gate verbietet hartkodierte Hosts).

- [x] **Pocket-ID OIDC-Client.** `k3d/pocket-id-client-seed.yaml`: Penpot als neuer Eintrag — `POCKET_ID_PENPOT_SECRET`, Callback-URL `$${SCHEME}://design.$${SUFFIX}/api/external-auth`. Muster: Vaultwarden-Eintrag im Seed-Job (Zeile 249–255).

- [x] **Admin-Navigation.** `components/website/src/lib/admin/nav-items.ts`: Neuer Eintrag in "Werkzeuge"-Sektion — `{ href: penpotUrl, label: "Penpot", icon: "palette", external: true }`. `NavOptions` um `penpotUrl` erweitert. `penpotUrl` durch `AdminLayout.astro` → `AdminSidebarNav.astro` wired.

- [x] **BATS-Tests.** Zwei Testdateien:
  - `tests/spec/auth-sso/penpot-oidc.bats`: Pocket-ID-Client-Provisionierung prüfen (Secret existiert, Client-URL in seed.yaml)
  - `tests/spec/fleet-operations/penpot-manifests.bats`: Domain-Keys referenziert (kein harter Hostname), Manifest-Struktur (Deployment, Service, IngressRoute), Penpot-Role in shared-db

## Verify (RED → GREEN)

- [x] **Failing-Test-Step (RED).** BATS-Test anlegen — FAIL, weil Manifeste/Registry-Keys fehlen.

- [x] **Fix-Step (GREEN).** Artefakte gemäß Tasks umsetzen; Test grün.

- [x] **Final Verification.** Die drei Pflicht-Gates (läuft in CI):
  - BATS: 14/14 tests pass (fleet-operations/penpot-manifests.bats, auth-sso/penpot-oidc.bats)
  - freshness:regenerate + freshness:check: alle Artefakte fresh
  - test:changed: 3 vorbestehende Failures (madge ENOENT auf Windows — penpot-unabhängig)

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
