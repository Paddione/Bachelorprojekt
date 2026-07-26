# Proposal: t002207-flux-health-gate

## Why

Seit dem FluxCD-Cutover (T002083) sind die beiden Marken-Kustomizations `flux-mentolder`
und `flux-korczewski` als **je ein monolithischer Apply-Block** modelliert: eine
Kustomization pro Marke, `path: ./mentolder` bzw. `./korczewski`, mit `wait: true` und
**ohne** `healthChecks`. Damit hängt der komplette Workspace-Stack einer Marke (~26 Pods)
an einem einzigen Alles-oder-Nichts-Gate.

Der Live-Befund vom 2026-07-26 zeigt den Schaden:

```
flux-korczewski   False   ReconciliationFailed   lastAppliedRevision: <none>   (seit 3d16h)
flux-mentolder    False   ReconciliationFailed   lastAppliedRevision: <none>   (seit 2d17h)
```

Ursache in beiden Fällen: `Job/<ns>/pocket-id-client-seed dry-run failed (Invalid):
spec.template: Invalid value: … field is immutable`. Flux appliziert eine Kustomization
**atomar** — schlägt der Server-Side-Dry-Run für *ein* Objekt fehl, wird der gesamte
Apply-Set verworfen, **bevor irgendetwas** angewendet wird. `lastAppliedRevision: <none>`
belegt: seit dem Cutover wurde für beide Marken **kein einziger** gemergter Commit
ausgerollt. Der Cluster läuft nur noch auf dem Stand, den der alte Push-Pfad
hinterlassen hat — ein stiller, unbemerkter Deploy-Freeze über Tage. Die
Website-Kustomizations (`flux-website-*`) sind grün — genau weil sie bereits als eigene,
kleinere Kustomization ausgelagert sind. Das ist der Beweis, dass die Aufteilung wirkt.

Zwei strukturelle Verstärker wirken hier zusammen:

1. **Apply-Atomarität** — ein invalides Objekt kippt den gesamten Marken-Apply.
   Blast Radius: 100 % der Marke.
2. **Pauschales `wait: true` ohne `healthChecks`** — selbst bei erfolgreichem Apply
   gilt die Kustomization erst als Ready, wenn *jede* Ressource gesund ist. Ein
   einmaliger Bootstrap-Job oder ein unkritischer CrashLoop hält damit die gesamte
   Kustomization (und jede `dependsOn`-Kette darunter) rot.

Hinzu kommt: Die einzige Alert-Route (`flux/clusters/fleet/notifications.yaml`) schickt
Fehler-Events an einen GitHub-Commit-Status-Provider. Ein dauerhaft nicht-readyer
Zustand erreicht damit keinen Menschen — der Freeze wurde erst durch manuelles
`kubectl get kustomization` entdeckt.

Dieser Change behebt **die Struktur**, nicht den aktuell blockierenden Workload.

## What

**In Scope (T002207 — strukturell):**

1. **Kustomization-Aufteilung**: Einmalige Bootstrap-/Seed-Jobs werden aus dem
   Marken-Monolithen in eine eigene Kustomization pro Marke (`flux-<brand>-jobs`)
   ausgelagert, die per `dependsOn` **hinter** dem App-Stack läuft und diesen
   nicht mehr gaten kann.
2. **Gezielte statt pauschale Health-Gates**: `wait: true` wird für die
   Marken-Kustomizations durch eine explizite `healthChecks`-Liste der wirklich
   tragenden Workloads ersetzt (Traefik-Ingress-Pfad, `shared-db`, `pocket-id`).
   Nicht-tragende Workloads degradieren, statt zu blockieren.
3. **Selbstheilung bei Immutable-Field-Konflikten**: Die Jobs-Kustomization erhält
   `spec.force: true`, damit unveränderliche Ressourcen neu erstellt statt
   dauerhaft abgelehnt werden.
4. **Fail-fast im Render-Gate**: Der CI-Render (`scripts/flux-render-artifact.sh` /
   `task flux:render`) validiert das gerenderte Tree, bevor das OCI-Artefakt gepusht
   wird — invalide Manifeste erreichen den Cluster gar nicht erst.
5. **Stuck-Detection**: Ein nicht-readyer Kustomization-Zustand jenseits eines
   Schwellwerts wird sichtbar gemacht (Alert-Route bzw. Check), statt tagelang
   still zu bleiben.
6. **Regressionstests** in `tests/spec/workspace-deploy.bats`, die die
   Blast-Radius-Invarianten der Flux-Manifeste festnageln.

**Non-Goals (bewusst abgegrenzt):**

- **Der konkrete kaputte Seed-Job gehört zu T002187** — warum
  `pocket-id-client-seed` reproduzierbar mit einem immutablen `spec.template`
  kollidiert und wie das Job-Manifest (`k3d/pocket-id-client-seed.yaml`) korrigiert
  wird, ist *nicht* Gegenstand dieses Changes. T002207 stellt sicher, dass der
  **nächste** kaputte Workload — welcher auch immer — keine ganze Marke mehr
  einfriert. Beide Tickets sind unabhängig mergebar; T002207 macht den Cluster
  gegen die Fehlerklasse robust, T002187 gegen diese eine Instanz.
- Kein Wechsel der Delivery-Architektur (OCI-Artefakt + Flux bleibt).
- Keine Aufteilung des `prod-fleet/<brand>`-Overlays in fachliche Sub-Stacks über
  die Jobs-Extraktion hinaus — das wäre ein eigener, größerer Change.
- Kein manueller Cluster-Eingriff (`flux reconcile`, `kubectl delete job`) als
  Bestandteil dieses Plans; der Unfreeze passiert über den regulären Merge-Pfad.

_Ticket: T002207_
