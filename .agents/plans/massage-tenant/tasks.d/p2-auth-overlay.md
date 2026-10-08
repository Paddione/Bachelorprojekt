---
title: "massage-tenant — eigenes Pocket ID ohne Workspace-Auftauen"
ticket_id: T901440
domains: [infra, auth, flux]
status: active
---
# massage-tenant — Implementation Plan

## File Structure

| Datei | Ist-Zeilen | Budget |
|---|---|---|
| `prod-fleet/korczewski-auth/kustomization.yaml` | 0 (neu) | n/a (YAML ohne S1-Limit) |
| `prod-fleet/korczewski-auth/namespace.yaml` | 0 (neu) | n/a (YAML ohne S1-Limit) |
| `prod-fleet/korczewski-auth/patch-pocket-id-db.yaml` | 0 (neu) | n/a (YAML ohne S1-Limit) |
| `prod-fleet/korczewski-auth/patch-tls-reflect.yaml` | 0 (neu) | n/a (YAML ohne S1-Limit) |
| `prod-fleet/korczewski-auth/cross-namespace-seed-rbac.yaml` | 0 (neu) | n/a (YAML ohne S1-Limit) |
| `flux/clusters/fleet/ks-korczewski-auth.yaml` | 0 (neu) | n/a (YAML ohne S1-Limit) |
| `scripts/flux-render-artifact.sh` | 454 | 346 |

Voraussetzung p1: zentrale DB/Rolle existiert, DB-NetworkPolicy erlaubt Auth-Namespace.
Keine Website-Quellcodeänderung. Shell-Datei nicht gebaselined, effektive Schwelle 800;
kleiner Renderblock hält sie deutlich unter 80 %. Alle Ressourcen im Overlay referenzieren.

## Task: Isoliertes Auth-Overlay und TLS betreiben

1. Ressourcen einzeln einbinden: `k3d/pocket-id.yaml`,
   `k3d/pocket-id-client-seed.yaml`, `k3d/pocket-id-client-seed-rbac.yaml`,
   `prod/wildcard-certificate.yaml`, `prod/reflector.yaml` und lokale Namespace-/RBAC-Dateien.
   Keine volle k3d-, prod-korczewski- oder fleet-common-Basis einbinden. Namespace
   `workspace-korczewski`; Namespace-Manifest explizit erstellen, weil SealedSecrets allein
   keine Namespace-Erzeugung garantieren. Domain-ConfigMap mit `configMapGenerator`
   `name: domain-config`, `disableNameSuffixHash: true` und
   `POCKET_ID_DOMAIN=${POCKET_ID_DOMAIN}` erzeugen.
2. Job `pocket-id-db-init` per gezieltem `$patch: delete` entfernen. p1 verwaltet Rollen;
   korczewski erhält weder Superuser-Zugang noch einen zweiten DB-Initializer. Service,
   Deployment, PVC und IngressRoute Pocket ID behalten. Deployment-Initcontainer auf
   `pg_isready -h shared-db.workspace.svc.cluster.local -p 5432 -U pocket_id_korczewski
   -d pocket_id_korczewski -q` umstellen. Deployment-Env `POCKET_ID_DB_PASSWORD` liest
   `workspace-secrets.POCKET_ID_KORCZEWSKI_DB_PASSWORD`; `DB_CONNECTION_STRING` lautet
   `postgresql://pocket_id_korczewski:$(POCKET_ID_DB_PASSWORD)@shared-db.workspace.svc.cluster.local:5432/pocket_id_korczewski?sslmode=require`.
   Kubernetes-Expansion `$(...)` erhalten, nicht durch Shell auswerten.
3. IngressRoute `pocket-id` auf `websecure` plus `tls.secretName: ${TLS_SECRET_NAME}`
   patchen (optional zusätzlich `web` mit lokalem HTTPS-Redirect). Host über
   `${POCKET_ID_DOMAIN}`; keine produktiven Domain-Literale. PVC `pocket-id-data` nicht
   ersetzen oder löschen; vor Rollout vorhandene Daten und Node-Affinity prüfen.
4. TLS tatsächlich über `tls-sync` spiegeln: im Cluster existiert kein Reflector-Controller.
   `prod/reflector.yaml` enthält SA, CronJob und globale RBAC. Globale ClusterRole und
   ClusterRoleBinding `tls-sync` gezielt löschen; Fleet-Platform besitzt beide bereits und
   bindet `workspace-korczewski/tls-sync`. In `patch-tls-reflect.yaml` CronJob-Args als
   vollständigen Skriptblock übernehmen, bestehende TLS-/Dockerconfig-Funktionen behalten,
   beide Zielschleifen ausschließlich auf `${WEBSITE_NAMESPACE}` begrenzen. Sonst würde
   korczewski das gemeinsame coturn-/workspace-office-Zertifikat überschreiben. Quelle
   `${WORKSPACE_NAMESPACE}`, Secret `${TLS_SECRET_NAME}` bleiben templatisiert. SA und
   CronJob im Auth-Namespace behalten. Erstes Spiegeln im Runbook ausdrücklich auslösen;
   wöchentlicher CronJob allein reicht beim Erststart nicht.
5. Seed-RBAC im Workspace aus Basis übernehmen. Die Website-Role und RoleBinding aus
   `k3d/pocket-id-client-seed-website-rbac.yaml` als lokale, explizit nach
   `website-korczewski` gerichtete Ressourcen nachbilden; Subject verweist auf
   `workspace-korczewski/pocket-id-client-seed`. Kustomize namespace transformer überschreibt
   Ressourcen-Namespaces: nach Transformation gezielte JSON-Patches für beide
   Website-RBAC-Namespaces UND Subject-Namespace verwenden. Nur `get,patch` auf
   `website-secrets`; Workspace-Role bleibt auf `workspace-secrets` beschränkt.
6. Seed unverändert ausführen; sein Label darf weiterhin NICHT dem Pocket-ID-Service-Selector
   entsprechen. `POCKET_ID_FRONTEND_URL`/Website-Namespace aus Environment. Seed legt
   Website- und owner-Clients samt `workspace-owners` an. Die Basis synchronisiert nur
   Website-Client-Secret nach website-secrets; Owner-Bereich nutzt bestehenden Website-Login.
   Entfernen des DB-init-Jobs entfernt auch dessen SQL-API-Key-Bootstrap: p4 muss Admin
   manuell bootstrappen, API-Key registrieren und Secret passend versiegeln, danach Seed-Job
   erneut erzeugen. Kein Secret erzeugen/ausgeben und keine Konten im Implementierungstask.

## Task: Flux und OCI-Artefakt verbinden

1. `flux-korczewski-auth`: OCIRepository `fleet-manifests`, Pfad `./korczewski-auth`,
   `suspend: false`, `prune: true`, `interval: 10m`, `timeout: 5m`, `retryInterval: 2m`.
   Dependencies `flux-infra-controllers`, `flux-platform`,
   `flux-sealed-secrets-korczewski`, `flux-mentolder` (zentrale DB).
   `wait: false` und expliziter Deployment-Healthcheck Pocket ID im Auth-Namespace;
   niemals alle Jobs als readiness gate verwenden, weil API-Key-Bootstrap manuell erfolgt.
   Zertifikats- und Seed-Erfolg separat im Runbook überprüfen.
2. Im Renderer eigenen subshell-Block mit `source scripts/env-resolve.sh fleet-korczewski`,
   `apply_schema_defaults`, Ausgabe `korczewski-auth/korczewski-auth.yaml` ergänzen.
   Neues Verzeichnis in Parse-/Validierungsschleife aufnehmen; bestehende Kopierlogik
   `flux/clusters/fleet/*.yaml` übernimmt neue Flux-Datei. Render-Ausgabe außerhalb Repo
   erzeugen; produktive Domains ausschließlich nach Environment-Substitution.
3. Besitzwechsel beim Rollout prüfen: suspendiertes `flux-korczewski` besitzt möglicherweise
   vorhandenes Pocket ID, PVC, Certificate und tls-sync. Doppelte Flux-Inventarzuordnung im
   Runbook dokumentieren, alte Kustomization nicht zum Bereinigen auftauen. Rückbau zuerst
   suspendieren; PVC/DB erhalten, kein pauschales delete des neuen Auth-Overlays.

## Task: Verifikation

Mit p5 koordinieren: Render-Positivanker Deployment Pocket ID; exakte Ressourcenliste,
kein shared-db/Nextcloud/Brett/Collabora, Namespace-RBAC und TLS-Zielschleifen prüfen.
Keine Cluster-Mutation für Plan-/Render-Verifikation.

```bash
kustomize build prod-fleet/korczewski-auth --load-restrictor=LoadRestrictionsNone > /tmp/massage-auth-render.yaml
bash scripts/pytest-run.sh tests/py/spec/massage-tenant/test_render_topology.py tests/py/spec/massage-tenant/test_flux_freeze.py
task workspace:validate
task test:changed
task freshness:regenerate
task freshness:check
```
