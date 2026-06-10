# Spec: Partial-Deploy — nur geänderte Services deployen

**Ticket:** T000588  
**Branch:** feature/partial-deploy-changed-services  
**Datum:** 2026-06-10  
**Status:** approved (offene_fragen_geklaert=true)

---

## Problem

`task workspace:deploy` rollt bei jedem Factory-Lauf **alle 47 Services** aus — unabhängig davon welche davon ein PR tatsächlich geändert hat. Ein PR der nur `brett.yaml` ändert, rollt dennoch Keycloak, Nextcloud, LiveKit etc. aus. Das verlängert die Deploy-Phase unnötig und erhöht das Fehlerrisiko (unberührte Services werden gerestartet).

---

## Lösung (MVP)

**Option D: kubectl `--selector` auf vollständigem kustomize-Build-Output.**

Kustomize-Struktur bleibt unverändert. Alle k3d-Ressourcen bekommen ein einheitliches `app: <service>`-Label. Der Factory-Deploy-Schritt ermittelt via `git diff` welche `k3d/*.yaml`-Dateien geändert wurden und wendet nur die zugehörigen Ressourcen per Label-Selector an.

`workspace:deploy` (vollständig) bleibt erhalten — Partial-Deploy ist **additives Feature** der Factory-Pipeline, kein Ersatz.

---

## Scope

### In Scope
1. **Label-Annotation:** Alle 47 `k3d/*.yaml`-Ressourcen bekommen `app: <service-slug>` als Label (Deployment, Service, Ingress, CronJob etc. je nach Typ)
2. **Service-Registry:** Mapping `k3d/<file>.yaml → app: <slug>` in einer neuen Datei `scripts/factory/service-registry.sh` (associative array)
3. **Factory-Pipeline-Erweiterung:** In `scripts/factory/pipeline.js` / Deploy-Agent: wenn `touched_files` nur `k3d/*.yaml`-Änderungen enthält, wird via `--selector` nur die betroffenen Services angewendet
4. **Taskfile-Task `workspace:partial-deploy`:** Neuer Task der `PARTIAL_SERVICES=<csv>` entgegennimmt und selektiv deployt

### Out of Scope
- Kustomize-Overlay-Refactoring (Option C) — zu aufwendig für MVP
- `configMapGenerator`-Einträge (realm-template, keycloak-import-script, nextcloud-oidc-config): diese haben keine `app`-Labels und werden beim Partial-Deploy immer mitangewendet (sicher, da idempotent)
- Infra-Ressourcen (namespace, network-policies, secrets, sealed-secrets): immer full-deploy, nie partial
- Korczewski-Brand: gleiches Schema, separates Ticket wenn nötig

---

## Architektur

### 1. Label-Schema

Jede Ressource in `k3d/*.yaml` bekommt:

```yaml
metadata:
  labels:
    app: <service-slug>        # z.B. brett, keycloak, nextcloud, livekit
    managed-by: kustomize      # bereits vorhanden in einigen
```

**Service-Slug-Mapping** (47 Ressourcen → ~30 slugs, da CronJobs/RBAC zum Service zählen):

| Datei(en) | Slug |
|-----------|------|
| brett.yaml | brett |
| keycloak.yaml | keycloak |
| nextcloud.yaml, nextcloud-redis.yaml | nextcloud |
| shared-db.yaml | shared-db |
| livekit.yaml | livekit |
| vaultwarden.yaml | vaultwarden |
| mailpit.yaml | mailpit |
| docs.yaml | docs |
| whiteboard.yaml | whiteboard |
| talk-hpb.yaml, talk-recording.yaml | talk |
| backup-cronjob.yaml, pvc-backup-cronjob.yaml, backup-pvc.yaml, backup-config.yaml, pvc-backup-rbac.yaml | backup |
| knowledge-ingest-cronjob.yaml | knowledge |
| notify-unread-cronjob.yaml, admin-actions-cronjobs.yaml, cronjob-monthly-billing.yaml, cronjob-dunning-detection.yaml | cronjobs |
| einvoice-sidecar.yaml | einvoice |
| oauth2-proxy-*.yaml | oauth2-proxy |
| traefik-dashboard-dev.yaml, ingress.yaml | traefik |
| claude-code-*.yaml | claude-code |
| pentest-flags.yaml | pentest |
| configmap-domains.yaml, network-policies.yaml, namespace.yaml | infra (nicht partial-deploybar) |

### 2. service-registry.sh

```bash
# scripts/factory/service-registry.sh
declare -A SERVICE_REGISTRY=(
  [k3d/brett.yaml]="brett"
  [k3d/keycloak.yaml]="keycloak"
  [k3d/nextcloud.yaml]="nextcloud"
  [k3d/nextcloud-redis.yaml]="nextcloud"
  [k3d/shared-db.yaml]="shared-db"
  # ... alle 47 Einträge
)
INFRA_FILES=("k3d/namespace.yaml" "k3d/network-policies.yaml" "k3d/configmap-domains.yaml" "k3d/secrets.yaml")
```

### 3. workspace:partial-deploy Task

```bash
workspace:partial-deploy:
  desc: "Nur geänderte Services deployen (PARTIAL_SERVICES=brett,keycloak)"
  vars:
    SELECTORS: '{{.PARTIAL_SERVICES | replace "," "|"}}'
  cmds:
    - |
      source scripts/env-resolve.sh "{{.ENV}}"
      kustomize build {{.ENV_OVERLAY}}/ --load-restrictor=LoadRestrictionsNone \
        | envsubst "$ENVSUBST_VARS" \
        | kubectl --context "$ENV_CONTEXT" apply --server-side --force-conflicts \
          -l "app in ({{.PARTIAL_SERVICES}})" -f -
```

### 4. Factory-Pipeline-Integration

In `scripts/factory/pipeline.js` Deploy-Phase:

```javascript
// Nach touched_files Auswertung:
const changedK3dFiles = touchedFiles.filter(f => f.startsWith('k3d/') && f.endsWith('.yaml'))
const hasInfraChanges = changedK3dFiles.some(f => INFRA_FILES.includes(f))
const touchedServices = [...new Set(changedK3dFiles.map(f => SERVICE_REGISTRY[f]).filter(Boolean))]

if (!hasInfraChanges && touchedServices.length > 0 && touchedServices.length <= 5) {
  // Partial-Deploy
  await runTask(`workspace:partial-deploy ENV=${brand} PARTIAL_SERVICES=${touchedServices.join(',')}`)
} else {
  // Vollständiger Deploy (Fallback + Infra-Änderungen)
  await runTask(`workspace:deploy ENV=${brand}`)
}
```

**Schwellwert:** ≤5 Services → partial, sonst full. Verhindert dass ein PR der 20 Services ändert trotzdem partial-deployed wird.

---

## Geänderte Dateien

| Datei | Änderung |
|-------|---------|
| `k3d/*.yaml` (47 Dateien, außer infra) | `app: <slug>` Label hinzufügen |
| `scripts/factory/service-registry.sh` | Neu: k3d-Datei → Service-Slug Mapping |
| `Taskfile.yml` | Neuer Task `workspace:partial-deploy` |
| `scripts/factory/pipeline.js` | Partial-Deploy-Logik in Deploy-Phase |

---

## Tests

1. **Unit-Test `tests/unit/factory/partial-deploy.bats`:**
   - Service-Registry vollständig (alle 47 k3d-Dateien abgedeckt)
   - Infra-Files korrekt klassifiziert (nie partial)
   - Schwellwert-Logik (≤5 → partial, >5 → full)

2. **Manuelle Verifikation (Dev-Cluster):**
   - PR mit nur `k3d/brett.yaml` ändern → Factory läuft `partial-deploy` → nur brett-Pod restarted
   - PR mit `k3d/namespace.yaml` → Factory läuft `workspace:deploy` (full fallback)

---

## Risiken & Mitigationen

| Risiko | Mitigation |
|--------|-----------|
| Label fehlt auf einer Ressource → wird nie partial-deployed | service-registry.bats prüft Vollständigkeit |
| `kubectl apply -l selector` wendet keine ConfigMaps an | ConfigMapGeneratoren sind idempotent → kein Problem |
| Partial-Deploy eines abhängigen Services (nextcloud ohne shared-db) | shared-db ist fast nie Änderungsziel; bleibt als bekannte Einschränkung |
| Rollback bei Fehler | Kein auto-rollback — Factory-Canary greift normal |

---

## Nicht umgesetzt (bewusste Grenzen MVP)

- Auto-Rollback bei partial-deploy-Fehler
- Dependency-Graph zwischen Services (shared-db vor nextcloud etc.)
- Korczewski parallel-deploy
