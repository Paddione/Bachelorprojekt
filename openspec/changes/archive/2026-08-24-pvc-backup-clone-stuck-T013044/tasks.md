---
title: "pvc-backup-clone-stuck-T013044 — Implementation Plan"
ticket_id: T013044
domains: [infra]
status: completed
file_locks: [k3d/pvc-backup-cronjob.yaml]
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# pvc-backup-clone-stuck-T013044 — Implementation Plan

_Ticket: T013044_

## File Structure

```
k3d/pvc-backup-cronjob.yaml   # MODIFY — Orchestrator-Args: Clone-Lifecycle-Härtung
```

## Kontext (live verifiziert 2026-08-22)

- CronJob `pvc-backup` (ns `workspace`, Schedule `0 3 * * *`) failed seit 2026-06-23 jede Nacht.
- Blocker: PVC `vaultwarden-data-backup-clone` auf `Terminating` seit `2026-06-23T01:03:09Z`,
  Finalizer `kubernetes.io/pvc-protection` gehalten vom Zombie-Pod
  `pvc-backup-mounter-20260610-093119-cns4z` (Succeeded, Node pk-hetzner-8).
- Fehlerbild im Orchestrator-Log: nur `error: timed out waiting for the condition`
  (beide `kubectl wait --timeout=3000s` laufen leer).

## Tasks

### 0. Sofortmaßnahme: Blocker räumen (Cluster-Mutation, vor Code-Änderung)

1. Zombie-Pod löschen (Succeeded, 73 Tage alt, sicher):
   ```bash
   kubectl delete pod pvc-backup-mounter-20260610-093119-cns4z -n workspace
   ```
2. Verifizieren, dass die Clone-PVC jetzt vollständig verschwindet:
   ```bash
   kubectl get pvc vaultwarden-data-backup-clone -n workspace   # → NotFound (ggf. nach ~30s)
   ```
3. Alte Mounter-Artefakte der manuellen Läufe aufräumen:
   ```bash
   kubectl delete jobs -n workspace -l app=pvc-backup,role=mounter --ignore-not-found
   kubectl delete pods -n workspace -l app=pvc-backup,role=mounter --ignore-not-found
   ```
4. Manuellen Lauf triggern und beobachten:
   ```bash
   kubectl create job --from=cronjob/pvc-backup pvc-backup-manual-$(date +%Y%m%d-%H%M%S) -n workspace
   kubectl logs -n workspace job/pvc-backup-manual-<ts> -f
   ```
5. Erfolgskriterium: Job `Complete`; Log zeigt `✓ vaultwarden-data OK` und
   `✓ nextcloud-data OK` bzw. `⚠ ... empty — skipping`; kein leftover Clone/Mounter danach.

### 1. Stale-Clone-Löschung mit Wartezeit + lautem Fehler

In `k3d/pvc-backup-cronjob.yaml`, Orchestrator-Args, Block
`# Stale clones from a crashed prior run would block creation.`:

```sh
# ALT:
for c in $CLONES; do
  kubectl -n "$NS" delete pvc "$c" --ignore-not-found || true
done

# NEU:
for c in $CLONES; do
  if ! kubectl -n "$NS" delete pvc "$c" --ignore-not-found --wait=true --timeout=120s; then
    echo "ERROR: clone $c stuck in Terminating — pods still referencing it:"
    kubectl -n "$NS" get pods -o json \
      | jq -r --arg c "$c" \
        '.items[] | select(.spec.volumes[]?.persistentVolumeClaim?.claimName == $c)
         | "  \(.metadata.name) phase=\(.status.phase) node=\(.spec.nodeName)"'
    exit 1
  fi
done
```

Hinweis: `jq` ist im Image `alpine/k8s:1.36.2` nicht garantiert vorhanden — falls nicht,
Fallback ohne jq dokumentieren (z.B. `kubectl get pods -o custom-columns=...` + grep) oder
jq im Image ergänzen. Executor prüft das vor dem Commit.

### 2. Bindungs-Check schärfen (löschender Clone ≠ gebunden)

Im Block `echo "Waiting for clone PVCs to bind..."`, innerhalb der Warteschleife:

```sh
# NEU nach dem PHASE-Read:
DEL=$(kubectl -n "$NS" get pvc "$c" -o jsonpath='{.metadata.deletionTimestamp}' 2>/dev/null || echo "")
[ -n "$DEL" ] && { echo "ERROR: clone $c is being deleted (since $DEL)"; exit 1; }
```

Damit kann ein no-op-gepatchter, löschender Clone den Lauf nicht mehr als „Bound" passieren.

### 3. Zombie-Mounter-Prävention

a) Vor `echo "Launching mounter Job $MOUNTER..."` alle alten Mounter-Jobs löschen:

```sh
kubectl -n "$NS" delete jobs -l app=pvc-backup,role=mounter --ignore-not-found || true
```

b) Im MJOB-Template (`spec:` des Jobs, neben `backoffLimit: 0`) ergänzen:

```yaml
  ttlSecondsAfterFinished: 86400
```

Begründung: Der ursprüngliche Zombie entstand aus einem manuellen Lauf ohne aufräumenden
Trap; `ttlSecondsAfterFinished` purgt beendete Jobs inkl. Pods auch dort automatisch.
Die Log-Ausgabe im Orchestrator (`kubectl logs job/$MOUNTER` direkt nach dem Wait) bleibt
unberührt (TTL 24h ≫ Sekunden).

### 4. Validierung & Merge

- `task workspace:validate` (Kustomize Dry-Run) muss grün sein.
- PR mit Titel `fix(pvc-backup): clone lifecycle hardening [T013044]`.
- Merge = Closure: Ticket schließt über grünen Auto-Merge; Prod-Render via Flux-Artifact.

### 5. Verifikation nach Deploy

- Nächsten Nachtlauf (03:00) oder manuellen Trigger beobachten → `Complete`.
- Danach prüfen: keine Clone-PVC übrig, keine Mounter-Jobs/Pods übrig
  (`kubectl get pvc,jobs,pods -n workspace -l app=pvc-backup`).
- Einmalige Gesamtabdeckung bestätigen: beide tar.enc-Archive in `/backups/pvc-<stamp>/`
  vorhanden und per `openssl enc -d` Probe-Entschlüsselung des Headers.
