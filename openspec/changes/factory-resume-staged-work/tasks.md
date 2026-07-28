---
title: "factory-resume-staged-work — Implementation Plan"
ticket_id: T002327
domains: [factory, agent-config, tests]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# factory-resume-staged-work — Implementation Plan

_Ticket: T002327._

Design: `openspec/changes/factory-resume-staged-work/design.md`.
Proposal: `openspec/changes/factory-resume-staged-work/proposal.md`.

## File Structure

```
GEAENDERT:
  scripts/factory/pipeline.js          (Reihenfolge REUSE/Worktree, Fremdbesitz-Verzweigung, Logging)
  scripts/factory/pipeline-runner.js   (read-partials meldet uebersprungene IDs und fehlendes Manifest)
  scripts/worktree-create.sh           (Markerzeile + Exit-Code fuer "Branch anderswo ausgecheckt")
  .claude/skills/dev-flow-execute/SKILL.md  (Fortsetzungs-Kontrakt, Hold-Default, reclaim)
  tests/spec/software-factory.bats     (Assertions zu Reihenfolge, Marker, Verzweigung)
```

Keine neuen Dateien. Kein Produktionsmanifest, keine Datenbankmigration, kein Deploy.

### S1-Budgets

| Datei | Endung | Limit | Ist | Wirksame Schwelle |
|---|---|---|---|---|
| `scripts/factory/pipeline.js` | `.js` | 600 | 603 | keine, Datei steht auf der `s1.ignore`-Liste |
| `scripts/factory/pipeline-runner.js` | `.js` | 600 | 476 | 600, Reserve 124 Zeilen |
| `scripts/worktree-create.sh` | `.sh` | 500 | 263 | 500, Reserve 237 Zeilen |
| `.claude/skills/dev-flow-execute/SKILL.md` | `.md` | keins | 250 | nicht S1-gated |
| `tests/spec/software-factory.bats` | `.bats` | keins | 4298 | nicht S1-gated |

`scripts/factory/pipeline.js` ist in `docs/code-quality/gates.yaml:65` ausdruecklich von S1
ausgenommen (Workflow-Skript-Monolith, T000460). Die 603 Zeilen sind kein Verstoss und der Change
darf dort Zeilen ergaenzen.

**Die Ausnahme ist kein Freibrief.** Dieselbe Begruendung verbietet der Datei Top-Level-Importe vor
`meta` und `import()` zur Laufzeit — deshalb gehoert nach Design E2 jede nicht-triviale Logik in
`pipeline-runner.js` (Reserve 124 Zeilen), nicht in `pipeline.js`. Ueberschreitet p2 diese Reserve,
ist das ein Split-Signal und kein Grund, Zeilen kosmetisch zusammenzuziehen.

## Abgrenzung

- `scripts/factory/queue.sh` wird **nicht** angefasst. Das Dispatch-Kriterium samt
  `execution_released`-Gate aus T002272 bleibt unveraendert (Design E5). Damit kollidiert dieser
  Change nicht mit T002329, das dieselbe Datei fuer die Typ-Vokabular-Umstellung vorsieht.
- `scripts/factory/partial-order.cjs` wird **nicht** angefasst. Die `.cjs`-Grenze liegt bei 200
  Zeilen; die vorhandene Sortier- und Filterlogik reicht unveraendert aus.
- `scripts/ticket.sh reclaim` wird **nicht** angefasst.

## Partials

| id | plan | rolle | target_files | depends_on |
|----|------|-------|--------------|------------|
| p1 | `tasks.d/p1-worktree-marker.md` | impl | `scripts/worktree-create.sh` | |
| p2 | `tasks.d/p2-runner-report.md` | impl | `scripts/factory/pipeline-runner.js` | |
| p3 | `tasks.d/p3-pipeline-order.md` | impl | `scripts/factory/pipeline.js` | p1, p2 |
| p4 | `tasks.d/p4-skill-contract.md` | impl | `.claude/skills/dev-flow-execute/SKILL.md` | p3 |
| p5 | `tasks.d/p5-tests.md` | tests | `tests/spec/software-factory.bats` | p1, p2, p3, p4 |

Die `target_files`-Mengen sind disjunkt (D1). p1 und p2 sind voneinander unabhaengig und koennen
parallel laufen; p3 verbraucht beide Kontrakte (Markerzeile aus p1, Rueckgabefelder aus p2), p4
beschreibt das fertige Verhalten, p5 prueft es.

## Verify (RED → GREEN)

- [x] **Failing-Test-Step (RED).** Die in p5 ergaenzten Assertions pruefen die Aufrufreihenfolge in
      `pipeline.js` und die Markerzeile in `worktree-create.sh`. Vor p1 bis p3 existiert beides
      nicht, der Lauf ist rot:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory.bats
# expected: FAIL (rot — Marker und korrigierte Reihenfolge existieren noch nicht)
```

- [x] **Fix-Step (GREEN).** Nach p1 bis p4 laeuft derselbe Aufruf gruen:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory.bats
```

- [x] **Reihenfolge-Beweis am Quelltext.** Der `setupWorktree`-Aufruf muss vor dem
      `read-partials`-Aufruf stehen; die Zeilennummern muessen aufsteigend sein:

```bash
grep -n 'setupWorktree(agent' scripts/factory/pipeline.js | head -1
grep -n "'read-partials'" scripts/factory/pipeline.js | head -1
```

- [x] **Fremdbesitz-Beweis ohne Fremdsession.** Denselben Branch, der bereits in diesem Worktree
      ausgecheckt ist, ein zweites Mal anfordern. Erwartet: Markerzeile und dedizierter Exit-Code
      statt des generischen Fehlschlags:

```bash
bash scripts/worktree-create.sh feature/factory-resume-staged-work-T002327 /tmp/wt-dup-probe > /tmp/wt-dup.log 2>&1
echo "exit=$?"
grep -c 'branch in use' /tmp/wt-dup.log
rm -rf /tmp/wt-dup-probe /tmp/wt-dup.log
```

- [x] **Kein Eingriff in das Hold-Gate.** `queue.sh` muss unveraendert bleiben:

```bash
git diff --exit-code origin/main -- scripts/factory/queue.sh
```

- [x] **Test-Inventar.** `tests/spec/software-factory.bats` existiert bereits, es kommt keine Datei
      hinzu — die `@test`-Zaehlung aendert sich aber:

```bash
task test:inventory
git status --porcelain website/src/data/test-inventory.json
```

- [x] **Final Verification.** Die drei verpflichtenden CI-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
