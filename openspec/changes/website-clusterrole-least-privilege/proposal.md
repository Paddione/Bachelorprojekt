# Proposal: website-clusterrole-least-privilege

## Why

Die ClusterRole `${WEBSITE_NAMESPACE}-monitoring-reader` (definiert in `k3d/website.yaml`) wird per
`ClusterRoleBinding` an den ServiceAccount `website` gebunden. Aktuell enthält diese ClusterRole neben
Monitoring-Leserechten auch weitreichende clusterweite Schreibrechte:
- `pods: delete` (wird in keiner API-Route der Website tatsächlich verwendet)
- `apps/deployments: patch` (wird nur lokal in `${WEBSITE_NAMESPACE}` und im Brand-Workspace für Redeploys/Scaling benötigt)
- `batch/jobs, cronjobs: create` (wird nur im Brand-Workspace für manuelle Backups, Restores und Knowledge-Reindex benötigt)
- `argoproj.io/applications: patch` (obsoleter Rest aus früherer ArgoCD-Nutzung, die durch FluxCD abgelöst ist)

Clusterweite Schreibrechte für einen anwendungsbezogenen ServiceAccount verletzen das Least-Privilege-Prinzip.
Ein kompromittierter Website-Pod könnte clusterweit Pods löschen, fremde Deployments patchen oder Jobs anlegen.

## What

1. **ClusterRole auf reines Lesen beschränken:**
   - Entfernen von `pods: delete`
   - Entfernen des ungenutzten API-Blocks `argoproj.io/applications`
   - Entfernen von `patch` bei `apps/deployments` (behält `get`, `list`)
   - Entfernen von `create` bei `batch/cronjobs, jobs` (behält `get`, `list`)
   - Die ClusterRole `${WEBSITE_NAMESPACE}-monitoring-reader` enthält danach ausschließlich Lese-Verben (`get`, `list`).

2. **Schreibrechte auf namespaced Roles begrenzen:**
   - In `${WEBSITE_NAMESPACE}`: Role `website-self-exec` in `k3d/website.yaml` um `apps/deployments: patch` ergänzen, damit die Website sich selbst redeployen kann (`/sdlc/api/ops/redeploy/website`).
   - In `workspace` (bzw. Brand-Workspace `workspace-korczewski`): Role `website-test-runner-exec` in `k3d/website-test-runner-rbac.yaml` um `apps/deployments: patch` und `batch/jobs: create` erweitern, damit die SDLC-Ops-Routen Workloads steuern und Backup-/Reindex-Jobs ausführen können.

3. **Absicherung via BATS:**
   - Neuer Spec-Test `tests/spec/security/website-clusterrole-least-privilege.bats`, der sicherstellt, dass die ClusterRole frei von Schreibverben ist und die namespaced Rollen die notwendigen Rechte bereitstellen.

_Ticket: T900114_
