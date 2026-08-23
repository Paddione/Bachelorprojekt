---
title: "p2-sleeper"
ticket_id: T015170
domains: [infra, security]
status: active
---

# Partial p2 — Sleeper-Job + RBAC (on-demand.yaml)

Implementiert den TTL-Wind-down als One-shot-Job. Die Datei liegt neben dem
Stack (`k3d/rustdesk-stack/on-demand.yaml`), wird aber **ausschließlich** vom
wake-Task angewendet und darf niemals in einen Kustomize-Build gelangen
(Guard-Test in p3).

### Task 1: Manifest anlegen

**Files:** `k3d/rustdesk-stack/on-demand.yaml` (neu)

Vier Dokumente (`---`-separiert), Namespace `rustdesk` durchgehend:

1. **ServiceAccount** `rustdesk-sleeper`
2. **Role** `rustdesk-sleeper` — minimal:
   ```yaml
   rules:
     - apiGroups: ["apps"]
       resources: ["deployments/scale"]
       verbs: ["get", "update", "patch"]
     - apiGroups: ["apps"]
       resources: ["deployments"]
       verbs: ["get"]
   ```
   Kein weiteres Verb, keine anderen Ressourcen — der Job darf ausschließlich
   skalieren und lesen.
3. **RoleBinding** `rustdesk-sleeper` — bindet die Role an den SA.
4. **Job** `rustdesk-sleeper`:
   - `backoffLimit: 0`, `restartPolicy: Never`,
     `ttlSecondsAfterFinished: 600` (Job-Rest aufräumen sich selbst)
   - Container `sleeper`, Image digest-gepinntes kubectl (z. B.
     `registry.k8s.io/kubectl:v1.31.1@sha256:…` — zum Zeitpunkt der
     Implementierung aktuellen Patch-Release wählen und Digest gegenziehen;
     Repo-Konvention: Infra-Images werden gepinnt)
   - Command:
     ```yaml
     command: ["/bin/sh", "-c"]
     args:
       - |
         echo "rustdesk sleeper: winding down in 1800s"
         sleep 1800
         kubectl scale deployment hbbs hbbr --replicas=0 -n rustdesk
         echo "rustdesk wound down"
     ```
   - Resources-Budget setzen (requests 10m/16Mi, limits 100m/64Mi — Größenordnung
     sessions-server), securityContext `runAsNonRoot: true`,
     `allowPrivilegeEscalation: false`, `seccompProfile: RuntimeDefault`
     (Hausstandard aus T014553).

### Task 2: Header-Kommentar

Erste Zeilen der Datei dokumentieren: Zweck (TTL-Wind-down), dass die Datei nur
vom wake-Task angewendet wird, und der Verweis auf den Guard-Test in
`tests/spec/rustdesk-server.bats`, der die Kustomize-Isolation sicherstellt.

## Verify

```bash
kubectl --context fleet apply --dry-run=client -n rustdesk \
  -f k3d/rustdesk-stack/on-demand.yaml
```
