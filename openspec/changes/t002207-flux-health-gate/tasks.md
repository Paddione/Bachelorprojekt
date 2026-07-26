---
title: "t002207-flux-health-gate — Implementation Plan"
ticket_id: T002207
domains: [infra, test]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# t002207-flux-health-gate — Implementation Plan

_Ticket: T002207_

Ziel: den **Blast Radius** eines einzelnen kaputten Workloads auf dem fleet-Cluster
eingrenzen. Nicht Ziel: den aktuell blockierenden `pocket-id-client-seed`-Job reparieren
— das ist T002187. Beide Änderungen sind unabhängig; dieser Plan darf `k3d/pocket-id-client-seed.yaml`
inhaltlich **nicht** anfassen (nur seine Zuordnung zu einem Kustomize-Component-Tree).

## Ausgangslage (Live-Befund 2026-07-26)

| Kustomization | Ready | lastAppliedRevision | Blocker |
|---|---|---|---|
| `flux-mentolder` | False | `<none>` | `Job/workspace/pocket-id-client-seed` dry-run Invalid (immutable `spec.template`) |
| `flux-korczewski` | False | `<none>` | `Job/workspace-korczewski/pocket-id-client-seed`, dito |
| `flux-website-*`, `flux-platform`, `flux-dev`, `flux-sealed-secrets-*` | True | aktuelles Digest | — |

`lastAppliedRevision: <none>` heißt: seit dem Flux-Cutover wurde für beide Marken nie
etwas appliziert. Die grünen `flux-website-*`-Kustomizations belegen, dass eine kleinere,
separat geschnittene Kustomization den Freeze überlebt.

## File Structure

```
NEU:
  flux/clusters/fleet/ks-jobs-mentolder.yaml       # Kustomization flux-mentolder-jobs
  flux/clusters/fleet/ks-jobs-korczewski.yaml      # Kustomization flux-korczewski-jobs
  prod-fleet/mentolder-jobs/kustomization.yaml     # Overlay: nur One-shot-Jobs, mentolder
  prod-fleet/korczewski-jobs/kustomization.yaml    # Overlay: nur One-shot-Jobs, korczewski
  scripts/flux-stalled-check.sh                    # Stuck-Detection über kubectl/flux CLI

GEÄNDERT:
  prod-fleet/mentolder/kustomization.yaml          # Jobs herausnehmen ($patch: delete bzw. Ressourcen-Ausschluss)
  prod-fleet/korczewski/kustomization.yaml         # dito
  flux/clusters/fleet/ks-mentolder.yaml            # wait:true -> healthChecks-Liste
  flux/clusters/fleet/ks-korczewski.yaml           # wait:true -> healthChecks-Liste
  scripts/flux-render-artifact.sh                  # +2 Component-Trees, +Validierungs-Gate vor Push
  Taskfile.yml                                     # flux:render Validierung, neuer flux:stalled-Task
  tests/spec/workspace-deploy.bats                 # Regressionstests (T002207)

NICHT ANFASSEN (Scope T002187):
  k3d/pocket-id-client-seed.yaml
```

## Pre-flight

- [ ] **P0 — Job-Inventar erheben.** Aus dem gerenderten Tree ermitteln, welche
      `kind: Job`-Objekte die Marken-Overlays heute enthalten. Referenz:

```bash
bash scripts/flux-render-artifact.sh --out /tmp/flux-render-t002207
grep -rn "^kind: Job" /tmp/flux-render-t002207/mentolder /tmp/flux-render-t002207/korczewski
```

      Ergebnis in diesem Plan als Liste festhalten. Nur diese Jobs wandern in die
      Jobs-Kustomization; CronJobs bleiben im App-Stack (sie sind wiederkehrend, nicht
      einmalig).

- [ ] **P0b — Load-bearing-Workloads festlegen.** Die `healthChecks`-Liste je Marke
      bestimmen: die Workloads, deren Ausfall den Deploy tatsächlich als gescheitert
      qualifiziert (`shared-db`, `pocket-id`, der Ingress-tragende Workload). Alles
      andere darf degradieren. Liste im PR-Body dokumentieren.

## Verify (RED → GREEN)

- [ ] **Task 1 — Failing-Test-Step (RED).** In `tests/spec/workspace-deploy.bats` die
      T002207-Regressionstests ergänzen, die auf dem aktuellen Stand rot sind:
      1. Kein Marken-Component-Tree (`mentolder/`, `korczewski/`) im gerenderten
         Artefakt enthält ein `kind: Job`.
      2. `flux/clusters/fleet/ks-mentolder.yaml` und `ks-korczewski.yaml` setzen kein
         nacktes `wait: true`, sondern eine nicht-leere `healthChecks`-Liste.
      3. Für jede Marke existiert eine Kustomization `flux-<brand>-jobs` mit
         `dependsOn: [flux-<brand>]` und `force: true`.
      4. `scripts/flux-render-artifact.sh` ruft vor dem Ende ein Validierungs-Gate auf
         und bricht bei invaliden Objekten mit Exit-Code ≠ 0 ab.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/workspace-deploy.bats -f 'T002207'
# expected: FAIL (rot — Aufteilung und Health-Gates existieren noch nicht)
```

- [ ] **Task 2 — Jobs-Overlays anlegen.** `prod-fleet/mentolder-jobs/kustomization.yaml`
      und `prod-fleet/korczewski-jobs/kustomization.yaml` erstellen, die genau die in P0
      inventarisierten One-shot-Jobs referenzieren (inkl. deren RBAC/ServiceAccount,
      soweit ausschließlich vom Job genutzt), mit derselben Namespace- und
      Image-Substitution wie das jeweilige Marken-Overlay.

- [ ] **Task 3 — Jobs aus den Marken-Overlays entfernen.** In
      `prod-fleet/mentolder/kustomization.yaml` und
      `prod-fleet/korczewski/kustomization.yaml` die betreffenden Job-Objekte aus dem
      Build nehmen (`$patch: delete`-Patch auf das Job-Objekt, analog zum bestehenden
      Muster für `k3d/secrets.yaml` im `prod/`-Overlay). Kustomize-Build danach
      verifizieren:

```bash
kustomize build prod-fleet/mentolder | grep -c "^kind: Job"   # erwartet: 0
kustomize build prod-fleet/mentolder-jobs | grep -c "^kind: Job"  # erwartet: >0
```

- [ ] **Task 4 — Renderer erweitern.** In `scripts/flux-render-artifact.sh` zwei
      Component-Trees ergänzen (`${OUT_DIR}/mentolder-jobs`, `${OUT_DIR}/korczewski-jobs`),
      analog zu den bestehenden `render_component`-Aufrufen für `website-mentolder` /
      `website-korczewski`, inklusive `env-resolve.sh`-Sourcing je Marke.

- [ ] **Task 5 — Jobs-Kustomizations anlegen.** `flux/clusters/fleet/ks-jobs-mentolder.yaml`
      und `ks-jobs-korczewski.yaml` erstellen: `path: ./mentolder-jobs` bzw.
      `./korczewski-jobs`, `dependsOn: [flux-mentolder]` bzw. `[flux-korczewski]`,
      `force: true`, `prune: true`, `wait: false`, `retryInterval: 5m`, `timeout: 10m`.
      `wait: false` ist hier bewusst: ein Bootstrap-Job soll die Reconciliation-Kette
      nie gaten, sein Ergebnis wird über die Stuck-Detection aus Task 7 sichtbar.

- [ ] **Task 6 — Health-Gates verschmälern.** In `flux/clusters/fleet/ks-mentolder.yaml`
      und `ks-korczewski.yaml` `wait: true` durch eine explizite `healthChecks`-Liste
      der in P0b bestimmten Workloads ersetzen. `timeout` von 5m auf einen Wert anheben,
      der zum langsamsten gelisteten Workload passt, damit ein legitimer Rollout nicht
      am Timeout scheitert.

- [ ] **Task 7 — Stuck-Detection.** `scripts/flux-stalled-check.sh` anlegen: liest per
      `kubectl --context fleet -n flux-system get kustomization -o json`, meldet jede
      Kustomization, die länger als ein Schwellwert (Default 30m, per Flag
      überschreibbar) `Ready=False` ist oder deren `lastAppliedRevision` nicht der
      Source-Revision entspricht, und beendet sich in dem Fall mit Exit-Code 1. Als
      `flux:stalled` in `Taskfile.yml` verdrahten. Read-only, keine Cluster-Mutation.

- [ ] **Task 8 — Fail-fast im Render-Gate.** In `scripts/flux-render-artifact.sh` nach
      dem Rendern und vor der Rückgabe des Trees ein Validierungs-Gate ergänzen
      (Schema-Validierung des gesamten `${OUT_DIR}` gegen die Kubernetes-Schemas), das
      Kind/Namespace/Name des ersten ungültigen Objekts nennt und mit Exit-Code ≠ 0
      abbricht. Damit läuft `flux push artifact` in
      `.github/workflows/render-fleet-artifact.yml` gar nicht erst an.

- [ ] **Task 9 — Fix-Step (GREEN).** Die Tests aus Task 1 müssen jetzt grün sein:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/workspace-deploy.bats -f 'T002207'
# expected: PASS
```

- [ ] **Task 10 — Dokumentation.** In `CLAUDE.md` (Abschnitt Key components) und
      `docs/superpowers/references/gotchas-footguns.md` die neue Kustomization-Topologie
      und die Blast-Radius-Regel festhalten: One-shot-Jobs gehören nie in den
      App-Stack einer Marke; `wait: true` ohne `healthChecks` ist auf Marken-Ebene
      verboten.

- [ ] **Final Verification.** Run the three mandatory CI gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

## Post-Merge-Beobachtung (nicht Teil des PR-Gates)

Nach dem Merge einmalig lesend prüfen, ob der App-Stack beider Marken wieder
appliziert — unabhängig davon, ob T002187 bereits gemergt ist:

```bash
kubectl --context fleet -n flux-system get kustomization -o wide
bash scripts/flux-stalled-check.sh
```

Erwartung: `flux-mentolder` und `flux-korczewski` Ready=True mit aktuellem
`lastAppliedRevision`; `flux-*-jobs` darf rot sein, solange T002187 offen ist — genau
das ist der Beleg, dass der Blast Radius eingegrenzt wurde.
