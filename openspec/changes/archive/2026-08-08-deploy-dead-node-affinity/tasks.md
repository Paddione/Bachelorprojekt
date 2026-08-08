---
title: "deploy-dead-node-affinity — tote Deploy-Konfiguration im mentolder-Auslieferungspfad entfernen (Vorgang C von 3)"
ticket_id: T002699
domains: [infrastructure, testing, plan-authoring]
status: plan_staged
file_locks: [prod-mentolder/kustomization.yaml, prod-fleet/mentolder/kustomization.yaml]
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# deploy-dead-node-affinity — Implementation Plan

Entfernt rund 300 Zeilen `nodeAffinity`-Constraints auf sechs stillgelegte Knoten aus dem
gebauten mentolder-Manifest und löst die Schicht auf, die `dev-db-refresh` erzeugt, damit beide
Wrapper es wieder verwerfen. Betrifft ausschließlich mentolder — korczewski ist sauber.

_Ticket: T002699_

## File Structure

| Datei | Ist | Budget |
| --- | --- | --- |
| `prod-mentolder/kustomization.yaml` | 155 | — (kein S1-Gate) — schrumpft |
| `prod-fleet/mentolder/kustomization.yaml` | 81 | — (kein S1-Gate) — schrumpft |
| `prod-mentolder/whisper.yaml` | 68 | — (kein S1-Gate) |
| `prod-fleet/staging/kustomization.yaml` | 74 | — (kein S1-Gate) |
| `CLAUDE.md` | 239 | — (kein S1-Gate) |
| `tests/spec/fleet-operations/dead-node-affinity.bats` | neu | — (kein S1-Gate) |

Gelöscht: `prod-mentolder/dev-db-refresh-cron.yaml`, `prod-mentolder/dev-db-refresh-netpol.yaml`,
`prod-mentolder/dev-db-refresh.sh`.

Regeneriert durch `task freshness:regenerate`: `website/src/data/test-inventory.json`,
`docs/code-quality/repo-index.json`.

## Partials

| ID | Datei | Rolle | Zieldateien |
| --- | --- | --- | --- |
| p1 | tasks.d/p1-node-affinity.md | impl | prod-mentolder/kustomization.yaml, prod-fleet/mentolder/kustomization.yaml |
| p2 | tasks.d/p2-dev-db-refresh.md | impl | prod-mentolder/dev-db-refresh-cron.yaml, prod-mentolder/dev-db-refresh-netpol.yaml, prod-mentolder/dev-db-refresh.sh, prod-mentolder/whisper.yaml, prod-fleet/staging/kustomization.yaml, CLAUDE.md |
| p3 | tasks.d/p3-invariant-tests.md | tests | tests/spec/fleet-operations/dead-node-affinity.bats, website/src/data/test-inventory.json |

`prod-mentolder/kustomization.yaml` gehört **allein p1**. p2 entfernt zwar die drei
`dev-db-refresh`-Dateien, deren `configMapGenerator`-Eintrag in derselben Kustomization steht —
dieser Eintrag wird trotzdem von p1 entfernt, damit die Zieldateien disjunkt bleiben. p2 fasst die
Datei nicht an.

## Reihenfolge und Abhängigkeit

p1 muss vor p2 fertig sein. Grund: Der `configMapGenerator` in `prod-mentolder/kustomization.yaml`
liest `dev-db-refresh.sh`. Löscht p2 die Datei, bevor p1 den Generator entfernt hat, schlägt jeder
`kustomize build` dazwischen fehl. p3 ist unabhängig und schreibt zuerst den roten Test.

## Ausgangsmessung (vor der Änderung erhoben, 2026-08-08)

| Messwert | Wert |
| --- | --- |
| Knoten im lebenden Cluster | pk-hetzner-4/6/8, gekko-hetzner-3/4 |
| `k3s-1` … `k3w-3` im gebauten mentolder-Output | je 50 Vorkommen |
| dieselben im gebauten korczewski-Output | 0 |
| Ressourcen im gebauten `prod-fleet/mentolder` | 342 |
| `dev-db-refresh` im Output beider mentolder-Wrapper | 0 |
| whisper-Affinität im Output | `In: [pk-hetzner-4, pk-hetzner-6, pk-hetzner-8]` |

Diese Zahlen sind die Vergleichsbasis. Weicht eine davon schon **vor** der Änderung ab, hat sich
der Stand seit der Planerstellung verschoben — dann erst klären, warum, statt den Plan
durchzuziehen.

## Entscheidungen (Brainstorming, Patrick, 2026-08-08)

1. **Neuzuschnitt statt Verschieben.** Die ursprüngliche Fassung (Service-Dirs nach `apps/`,
   Deploy-Dirs nach `deploy/`) wurde nach der Messung verworfen: `website/` 560 betroffene
   Dateien, `k3d/` 283, `environments/` 185 — Regressionsrisiko ohne funktionalen Gewinn, und
   `apps/` ist bereits durch die App-Registry belegt.
2. **Nur mentolder.** Korczewski nutzt einen positiven `In`-Selektor und ist im gebauten Output
   sauber.
3. **Beweis per Build-Diff.** Genau die Eigenschaft, die der Verschiebe-Variante fehlte.

## Final Verification

- [ ] **Build-Diff und Invarianten.** Der Diff darf ausschließlich aus dem Wegfall der
      `nodeAffinity`-Blöcke bestehen.

```bash
# Referenz-Build vom Stand VOR der Aenderung (aus git stash / worktree auf origin/main)
# nach /tmp/before-mentolder.yaml erzeugen, dann:
set -a; . <(bash scripts/env-resolve.sh mentolder); set +a
kustomize build prod-fleet/mentolder --load-restrictor=LoadRestrictionsNone > /tmp/after-mentolder.yaml

# Anker: beide Builds haben Inhalt — sonst waere jeder Vergleich wertlos
[ -s /tmp/before-mentolder.yaml ] && [ -s /tmp/after-mentolder.yaml ] || { echo "FATAL: leerer Build"; exit 1; }

# Invariante 1: Ressourcenzahl unveraendert
[ "$(grep -c '^kind:' /tmp/after-mentolder.yaml)" -eq 342 ] || { echo "FATAL: Ressourcenzahl weicht ab"; exit 1; }

# Invariante 2: whisper behaelt seine Fleet-Platzierung.
# yq statt grep -A<n>: die Affinitaet steht rund 20 Zeilen unter dem Deployment-Namen,
# ein Zeilenfenster trifft sie nicht zuverlaessig und meldet falsch-negativ.
WQ='select(.kind == "Deployment" and .metadata.name == "whisper")'
# Anker: das Deployment ist ueberhaupt im Build
[ -n "$(yq eval-all "$WQ | .metadata.name" /tmp/after-mentolder.yaml)" ] || { echo "FATAL: whisper-Deployment fehlt im Build"; exit 1; }
# Aussage: es verlangt einen Fleet-CP-Knoten
yq eval-all "$WQ | .spec.template.spec.affinity.nodeAffinity.requiredDuringSchedulingIgnoredDuringExecution.nodeSelectorTerms[0].matchExpressions[0].values" /tmp/after-mentolder.yaml \
  | grep -q 'pk-hetzner-4' || { echo "FATAL: whisper-Platzierung verloren"; exit 1; }

# Invariante 3: keine toten Knoten mehr
for n in k3s-1 k3s-2 k3s-3 k3w-1 k3w-2 k3w-3; do
  [ "$(grep -c -- "- $n\$" /tmp/after-mentolder.yaml)" -eq 0 ] || { echo "FATAL: $n noch im Output"; exit 1; }
done

# Invariante 4: die beiden anderen Overlays bauen unveraendert
kustomize build prod-fleet/mentolder-jobs --load-restrictor=LoadRestrictionsNone > /dev/null
set -a; . <(bash scripts/env-resolve.sh korczewski); set +a
kustomize build prod-fleet/korczewski --load-restrictor=LoadRestrictionsNone > /dev/null
```

- [ ] **Guard-Test grün.**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/fleet-operations/dead-node-affinity.bats
```

- [ ] **Manifest- und CI-Gates.**

```bash
task workspace:validate
task test:changed
task freshness:regenerate
task freshness:check
```

- [ ] **Nach dem Merge: Flux-Reconcile beobachten.** Der Vorgang ändert das OCI-Artefakt für eine
      Produktivmarke. Nach dem Merge prüfen, dass die Kustomization `flux-mentolder` sauber
      reconciled und kein Pod neu geplant wird — die entfernten Constraints waren wirkungslos,
      also darf sich an der Platzierung nichts ändern.
