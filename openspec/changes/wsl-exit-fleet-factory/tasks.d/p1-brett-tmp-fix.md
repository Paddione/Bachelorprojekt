# P1 — brett tmp emptyDir fix

```yaml
title: "P1 brett-tmp-fix"
ticket_id: T016422
domains: [infra]
status: active
target_files:
  - k3d/dev-stack/brett-dev.yaml
```

Ziel: CrashLoopBackOff des Deployments `brett` in workspace-dev beheben (152 Restarts,
verifizierte Ursache: `mkdir '/tmp/tsx-1000' ENOENT` — Image läuft als uid 1000 mit
`readOnlyRootFilesystem: true`, kein beschreibbares `/tmp`). Blockiert aktuell die
flux-dev-Reconciliation und damit jeden weiteren Partial auf diesem Pfad.

## Tasks

- [ ] **T1.1** In `k3d/dev-stack/brett-dev.yaml` am Pod-Spec ergänzen:

      ```yaml
      volumes:
        - name: tmp
          emptyDir: {}
      ```

- [ ] **T1.2** Am Container `brett` mounten:

      ```yaml
      volumeMounts:
        - name: tmp
          mountPath: /tmp
      ```

- [ ] **T1.3** Kommentar über dem Volume ergänzen: Ursache T016422 (tsx IPC legt
      `/tmp/<uid>` an; readOnlyRootFilesystem macht das Container-Layer read-only).

## Verify

```bash
kustomize build k3d/dev-stack | grep -A2 'mountPath: /tmp'
task workspace:validate
```

Nach Merge+Flux-Sync live prüfen (Operator):

```bash
kubectl --context fleet -n workspace-dev rollout status deploy/brett --timeout=120s
kubectl --context fleet -n workspace-dev get pods -l app=brett
```
