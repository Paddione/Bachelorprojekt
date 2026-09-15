# Design: website-clusterrole-least-privilege

## Kontext & Problemstellung

Mit Ticket T900110 wurde `pods/exec` aus der `ClusterRole` `${WEBSITE_NAMESPACE}-monitoring-reader` entfernt und auf namespaced Rollen beschränkt.
Die Entscheidung vom 2026-09-10 trennte T900114 als Folge-Ticket ab, um auch die restlichen clusterweiten Schreibrechte der ClusterRole zu bereinigen:
- `pods: delete`
- `apps/deployments: patch`
- `batch/cronjobs, jobs: create`
- `argoproj.io/applications: patch`

## Analyse der Website-Routen (`components/website/src/pages/sdlc/api/**`)

1. **Kein `pods: delete`:**
   Eine statische Code-Analyse über das gesamte Website-Repository zeigt, dass nirgends ein Pod-Löschbefehl (`DELETE /api/v1/.../pods/...`) oder ein entsprechender Client-Aufruf existiert. Die Regel in der ClusterRole war ein historischer Überhang und kann ersatzlos entfallen.

2. **Kein `argoproj.io/applications`:**
   Das GitOps-Modell des Repositories basiert ausschließlich auf FluxCD. ArgoCD ist seit langem dekommissioniert. Die API-Gruppe `argoproj.io` wird in der gesamten Web-Applikation nicht referenziert. Die Regel kann ersatzlos entfallen.

3. **`apps/deployments: patch`:**
   Wird verwendet in:
   - `/sdlc/api/ops/redeploy/website.ts` → Namespace `website` (oder `website-korczewski`)
   - `/sdlc/api/ops/redeploy/docs.ts`, `/sdlc/api/ops/redeploy/brett.ts` → Namespace `workspace` (oder `workspace-korczewski`)
   - `/sdlc/api/ops/deployments/[ns]/[name]/restart.ts` und `scale.ts` → Namespaces `workspace`, `workspace-korczewski`, `website`, `website-korczewski`
   - `/sdlc/api/deployments/[name]/restart.ts` und `scale.ts` → Namespace `workspace` (oder `workspace-korczewski`)

   Schreibrechte werden also nur in den beiden brand-eigenen Namespaces benötigt: `${WEBSITE_NAMESPACE}` und dem zugehörigen Workspace (`workspace` bzw. `workspace-korczewski`).

4. **`batch/jobs: create`:**
   Wird verwendet in:
   - `/sdlc/api/ops/backup/trigger.ts` → Namespace `workspace` / `workspace-korczewski`
   - `/sdlc/api/ops/restore.ts` → Namespace `workspace` / `workspace-korczewski`
   - `/sdlc/api/ops/ai/reindex.ts` → Namespace `workspace`

   Schreibrechte werden nur im jeweiligen Workspace-Namespace benötigt.

## Architektur & Zielbild

```
Cluster-Ebene:
  ClusterRole: ${WEBSITE_NAMESPACE}-monitoring-reader
  Verb: NUR ["get", "list"]
  Kein "delete", kein "patch", kein "create", kein "update"

Namespace-Ebene (${WEBSITE_NAMESPACE}):
  Role: website-self-exec
  Verbs:
    - pods/exec: create
    - apps/deployments: patch

Namespace-Ebene (workspace / workspace-korczewski):
  Role: website-test-runner-exec
  Verbs:
    - pods/exec: create
    - apps/deployments: patch
    - batch/jobs: create
```

## Absicherung & Kompatibilität

- Kustomize-Overlays: `k3d/website-test-runner-rbac.yaml` wird wie in T900110 in der Base deklariert und über das Overlay im jeweiligen Workspace-Namespace instanziiert.
- CI & Quality Gates: `tests/spec/security/website-clusterrole-least-privilege.bats` validiert die strikte Lese-Only-Eigenschaft der ClusterRole sowie das Vorhandensein der namespaced Berechtigungen.
