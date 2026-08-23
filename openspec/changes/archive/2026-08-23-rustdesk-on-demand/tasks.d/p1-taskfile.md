---
title: "p1-taskfile"
ticket_id: T015170
domains: [infra]
status: active
---

# Partial p1 — Taskfile rustdesk:deploy/wake/sleep/status

Implementiert den task-gesteuerten Lifecycle. Neues Include-File nach dem
bestehenden `taskfiles/`-Muster (12 Vorbilder); der Stack bleibt bewusst
außerhalb Flux (Reconcile würde Scale-to-0 zurücknudeln).

### Task 1: taskfiles/Taskfile.rustdesk.yml anlegen

**Files:** `taskfiles/Taskfile.rustdesk.yml` (neu)

Vier Tasks, alle gegen `--context fleet`, Namespace `rustdesk`. Der
Render-Pipeline-Pattern wird 1:1 aus `fleet:shared-services` übernommen
(`kustomize build … | sed -E 's/: \$\{…\}$/: "${\1}"/g' | envsubst '$TURN_NODE' |
kubectl apply -f -`) — die sed-Zeile schützt ungesetzte Platzhalter vor
envsubst-Leerung (T002209-Muster).

- **`rustdesk:deploy`** — vollständige Bring-up: Render-Pipeline auf
  `k3d/rustdesk-stack`, danach `rollout status` für hbbs+hbbr (timeout 180s),
  dann Sleeper-Job anlegen (siehe wake). Idempotent (apply).
- **`rustdesk:wake`** — schnelles Aufwecken: prüfen ob `deploy/hbbs` existiert;
  wenn ja nur `kubectl scale deployment hbbs hbbr --replicas=1`, sonst zuerst
  den deploy-Block ausführen. Danach Sleeper-Job erneuern:
  `kubectl --context fleet delete job rustdesk-sleeper -n rustdesk
  --ignore-not-found && kubectl --context fleet apply -n rustdesk -f
  k3d/rustdesk-stack/on-demand.yaml` (Job-Spec ist immutabel — delete+apply ist
  der einzige Weg, den TTL-Timer neu zu starten).
- **`rustdesk:sleep`** — sofortiges Wind-down: beide Deployments auf
  `--replicas=0` skalieren, Sleeper-Job löschen (`--ignore-not-found`).
- **`rustdesk:status`** — `kubectl get deploy,pods -n rustdesk -o wide` plus
  Replica-Zähler; reiner Lese-Task.

Vars: `ENV: '{{.ENV | default "mentolder"}}'` (dokumentiert als informativ —
der Kontext ist fest `fleet`). Preconditions wie im office-Task
(`kubectl cluster-info`).

### Task 2: Include im Root-Taskfile registrieren

**Files:** `Taskfile.yml`

Im bestehenden `includes:`-Block (Zeile 4 ff.) einen Eintrag ergänzen:

```yaml
  # RustDesk-Relay on-demand (T015170): bewusst NICHT über Flux/Kustomize-
  # Roots verwaltet — Reconcile würde das imperative Scale-to-0 des
  # Sleeper-Jobs zurücknehmen. Siehe openspec/changes/rustdesk-on-demand.
  rustdesk:
    taskfile: ./taskfiles/Taskfile.rustdesk.yml
    dir: .
```

## Verify

```bash
task workspace:validate            # unberührt, muss grün bleiben
task --list | grep rustdesk        # 4 Targets sichtbar
```
