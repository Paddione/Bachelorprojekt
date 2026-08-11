---
title: "batch-ci-check-evaluation — Implementation Plan"
ticket_id: T003540
domains: [ci-cd, dev-tooling, testing]
status: active
file_locks: []
shared_changes: false
batch_id: T003540
parent_feature: null
depends_on_plans: []
---

# batch-ci-check-evaluation — Implementation Plan

_Ticket: T003540_

Batch-Plan für sechs Kind-Tickets der CI/Check-Auswertung. Sieben disjunkte Partials unter
`tasks.d/` (Mechanik T002074), das letzte trägt die Tests-Rolle mit dem Failing-Test-Step.
Kontext und Entscheidungen: `proposal.md` + `design.md` im selben Ordner. Die Kinder sind:

- T002815 → p6 (Commit-Push-Verifikation, Runbook)
- T002827 → p1 (pre-push scope guard)
- T002922 → p2 (Cluster-BATS in CI)
- T003109 → p5 (Warteschleifen nutzen die gemeinsame Verdict-Funktion; Kern-Fix bereits shipped)
- T003136 → p4 (Archive-Freshness)
- T003138 → p3 (test:changed E2E-Relevanz)

## File Structure

```
.githooks/pre-push                                                (geändert — p1)
scripts/pre-push-scope-range.sh                                   (neu — p1)
scripts/ci-cluster-bats.mjs                                       (neu — p2)
.github/workflows/ci.yml                                          (geändert — p2)
scripts/test-changed.sh                                           (neu — p3)
Taskfile.yml                                                      (geändert — p3)
scripts/openspec.sh                                               (geändert — p4)
.opencode/skills/openspec-archive-change/SKILL.md                 (geändert — p4)
scripts/devflow-ci-watch.sh                                       (geändert — p5)
.claude/skills/git-workflow/SKILL.md                              (geändert — p6)
.agents/skills/git-workflow/SKILL.md                              (geändert — p6)
tests/spec/ci-cd/pre-push-scope-guard.bats                        (neu — p7)
tests/spec/ci-cd/cluster-bats-registry.bats                       (neu — p7)
tests/spec/ci-cd/test-changed-relevance.bats                      (neu — p7)
tests/spec/ci-cd/archive-freshness-commit.bats                    (neu — p7)
tests/spec/ci-cd/devflow-ci-watch-empty-guard.bats                (neu — p7)
tests/spec/batch-ci-check-evaluation.bats                         (neu — p7)
openspec/changes/batch-ci-check-evaluation/specs/ci-cd.md         (Delta — Plan-Artefakt)
```

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | `tasks.d/p1-prepush-scope-guard.md` | impl | `.githooks/pre-push`, `scripts/pre-push-scope-range.sh` | |
| p2 | `tasks.d/p2-cluster-bats-ci.md` | impl | `scripts/ci-cluster-bats.mjs`, `.github/workflows/ci.yml` | |
| p3 | `tasks.d/p3-test-changed-relevance.md` | impl | `scripts/test-changed.sh`, `Taskfile.yml` | |
| p4 | `tasks.d/p4-archive-freshness.md` | impl | `scripts/openspec.sh`, `.opencode/skills/openspec-archive-change/SKILL.md` | |
| p5 | `tasks.d/p5-wait-loop-verdict.md` | impl | `scripts/devflow-ci-watch.sh` | |
| p6 | `tasks.d/p6-commit-push-verification.md` | impl | `.claude/skills/git-workflow/SKILL.md`, `.agents/skills/git-workflow/SKILL.md` | |
| p7 | `tasks.d/p7-tests.md` | tests | `tests/spec/ci-cd/pre-push-scope-guard.bats`, `tests/spec/ci-cd/cluster-bats-registry.bats`, `tests/spec/ci-cd/test-changed-relevance.bats`, `tests/spec/ci-cd/archive-freshness-commit.bats`, `tests/spec/ci-cd/devflow-ci-watch-empty-guard.bats`, `tests/spec/batch-ci-check-evaluation.bats` | p1, p2, p3, p4, p5, p6 |

Hinweis zur Reihenfolge: Die Tests aus p7 werden gemäß Rot-Grün-Prinzip ZUERST geschrieben
(siehe P7.7 — sie sind vor p1–p6 rot); das Manifest-`depends_on` von p7 beschreibt die
Grün-Abnahme, nicht den Schreibzeitpunkt.

Abstimmung mit der Factory (T002827): `.worktrees/fix-prepush-stale-scope-T002827-reuse` ist
in_progress und wird NICHT angefasst. Mergt der T002827-PR vor Ausführung dieses Batch,
rebased p1 auf den gemergten Stand und übernimmt nur den dort noch fehlenden
Test-/Helper-Teil (p7-Testdatei bleibt).

## Final Verification

- [ ] Gesamtabnahme des Change — alle Kommandos müssen grün sein:

```bash
bash scripts/plan-lint.sh openspec/changes/batch-ci-check-evaluation/tasks.md
tests/unit/lib/bats-core/bin/bats -r tests/spec/ci-cd/
tests/unit/lib/bats-core/bin/bats -r tests/spec/batch-ci-check-evaluation.bats
task test:inventory
task test:changed
task freshness:regenerate
task freshness:check
```

- [ ] Deliverable-Probe: `bash scripts/pre-push-scope-range.sh --help` zeigt die Usage; der
      Cluster-Job `cluster-spec-shard` ist in `.github/workflows/ci.yml` vorhanden;
      `scripts/test-changed.sh` wird von `Taskfile.yml` referenziert.
- [ ] Regeneriertes `website/src/data/openspec-status.json` und
      `website/src/data/test-inventory.json` sind mitcommittet (CI-Inventar-/Freshness-Check).
