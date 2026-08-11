---
title: "batch-repo-hygiene-ops-fixes — Implementation Plan"
ticket_id: T003490
domains: [plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: T003490
parent_feature: null
depends_on_plans: []
---

# batch-repo-hygiene-ops-fixes — Implementation Plan

_Ticket: T003490 — Batch: repo-hygiene-ops §1-§3 Fixes (6 Kinder)_

## File Structure

```
scripts/branch-reaper.sh                        (p1)   S1: Ist 255 - Baseline 0 -> Budget 545 (Limit 800)
.claude/skills/references/repo-hygiene-ops.md   (p2)   Markdown, kein S1-Gate (Limit 0)
scripts/devflow-ci-watch.sh                     (p3)   S1: Ist 182 - Baseline 0 -> Budget 618 (Limit 800)
scripts/repo-hygiene-cron.sh                    (p4)   S1: Ist 185 - Baseline 0 -> Budget 615 (Limit 800)
tests/spec/batch-repo-hygiene-ops-fixes.bats    (p5)   neue Datei (Ist 284, kein S1-Gate)
openspec/changes/batch-repo-hygiene-ops-fixes/specs/batch-repo-hygiene-ops-fixes.md (p5)  Markdown, kein S1-Gate
```

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | `tasks.d/p1-reaper-sweep.md` | impl | `scripts/branch-reaper.sh` | |
| p2 | `tasks.d/p2-runbook-fixes.md` | impl | `.claude/skills/references/repo-hygiene-ops.md` | p1 |
| p3 | `tasks.d/p3-ci-watch.md` | impl | `scripts/devflow-ci-watch.sh` | p2 |
| p4 | `tasks.d/p4-cron-vorcheck.md` | impl | `scripts/repo-hygiene-cron.sh` | p2 |
| p5 | `tasks.d/p5-tests.md` | tests | `tests/spec/batch-repo-hygiene-ops-fixes.bats`, `openspec/changes/batch-repo-hygiene-ops-fixes/specs/batch-repo-hygiene-ops-fixes.md` | p1, p2, p3, p4 |

## Ist-Stand (2026-08-11, nach Rebase auf origin/main + Teil-Implementierung c8e68ba97)

Die Teil-Implementierung (Befund T003632) wurde als Commit `c8e68ba97` auf dem Branch
gesichert. Sie deckt p1 (Leer-Signal), p2 (Runbook-Text), p3 (ci-watch-Fixes) und p4
(Tick-Vorcheck) weitgehend ab; die BATS-Suite (p5, 10 Tests) ist 9/10 grün.

**Verbleibende Arbeit (RED-Anker):** Test 10 ist ROT — der Cron bricht mit
`set -euo pipefail` an der `remote_branch_count`-Pipeline ab, wenn der Remote keine
non-main-Branches hat (`grep -v` Exit 1 bei leerem Ergebnis). Fix in p4 Step 2
dokumentiert. Außerdem: Runbook §2 sollte den `--sweep`-Modus (seit T003180 auf main)
als Aufruf zeigen — Abgleich in p2/p1.

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Der BATS-Test Test 10 (cron tick_vorcheck) ist ROT:
      der Cron stirbt nach "collecting metrics" (Exit 1 statt 0, keine JSON-Ausgabe).
      Die übrigen 9 Tests sind durch die Teil-Implementierung grün.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/batch-repo-hygiene-ops-fixes.bats
# expected: 9 ok / 1 not ok (Test 10) — nach p4-Step-2: 10/10 ok
```

- [ ] **Fix-Step (GREEN).** Implementiere den p4-pipefail-Fix und gleiche p1/p2-Runbook
      gegen den Ist-Stand ab. Die BATS-Suite muss danach 10/10 grün sein.

- [ ] **Final Verification.** Drei Pflicht-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

## Child-Ticket-Zuordnung

- T003074 → p1 (Reaper --sweep Modus; Sweep-Kern seit T003180 auf main, hier Leer-Signal + Verifikation)
- T003183 → p2 (§2 [gone]-Prune-Reihenfolge + Archiv-Tag)
- T003181 → p2 (§3 merge-tree Konfliktprobe)
- T003224 → p2+p3 (gh pr checks cancelled≠fail)
- T003225 → p3 (statusCheckRollup headSha-Filter)
- T003227 → p2+p4 (Factory-Tick-Vorcheck; p4 zusätzlich: pipefail-Abbruch bei leerem Remote-Bestand)
