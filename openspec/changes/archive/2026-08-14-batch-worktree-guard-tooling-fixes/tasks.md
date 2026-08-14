---
title: "Batch: Worktree-/Guard-Tooling-Fixes"
ticket_id: T004295
domains: [scripts, git-workflow, ticket-mcp, repo/hooks]
status: completed
---

# batch-worktree-guard-tooling-fixes — Implementation Plan

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | `tasks.d/p1-precommit-batch-branches.md` | impl | `.githooks/pre-commit`, `CLAUDE.md` | |
| p2 | `tasks.d/p2-guard-suffix-normalize.md` | impl | `scripts/hooks/worktree-write-guard.sh` | |
| p3 | `tasks.d/p3-archive-plan-gitshow.md` | impl | `scripts/ticket.sh` | |
| p4 | `tasks.d/p4-embed-connect-timeout.md` | impl | `scripts/openspec-embed.mjs` | |
| p5 | `tasks.d/p5-deploy-route-sdlc-exclude.md` | impl | `scripts/devflow-post-merge-deploy.sh`, `.claude/skills/references/deploy-routing.md` | |
| p6 | `tasks.d/p6-bats-guards.md` | tests | `tests/spec/batch-worktree-guard-tooling-fixes/*.bats`, `website/src/data/test-inventory.json` | p1, p2, p3, p4, p5 |

Die fünf Implementierungs-Partials sind disjunkt (D1) und haben keine harten Abhängigkeiten
untereinander. Das Tests-Partial läuft zuletzt und trägt die Failing-Test-Steps
(STRUCT2) für alle fünf Fixes.

## File Structure

```
.githooks/pre-commit                                            (geändert, T004261)
CLAUDE.md                                                       (geändert, Rule 7)
scripts/hooks/worktree-write-guard.sh                           (geändert, T003991)
scripts/ticket.sh                                               (geändert, T004269)
scripts/openspec-embed.mjs                                      (geändert, T003988)
scripts/devflow-post-merge-deploy.sh                            (geändert, T003982)
.claude/skills/references/deploy-routing.md                     (geändert, T003982)
tests/spec/batch-worktree-guard-tooling-fixes/                  (neu, p6)
website/src/data/test-inventory.json                            (regeneriert, p6)
```

## Task 0: Setup & Vorbedingungen

- [ ] Worktree liegt vor: `.worktrees/batch-worktree-guard-tooling-fixes-T004295` auf
      `feature/batch-worktree-guard-tooling-fixes-T004295` (base origin/main)
- [ ] Branch-Lock aktiv (`scripts/agent-lock.sh check branch feature/batch-worktree-guard-tooling-fixes-T004295`)
- [ ] `git fetch origin main` — kein Rebase-Konflikt mit main

## Task 1–5: Implementierungs-Partials

Die Tasks je Partial stehen in den Manifest-Dateien `tasks.d/pX-*.md` (siehe Tabelle).
Pro Partial: Rot-Phase (failing Test), dann Implementierung. Keine Datei gehört zu zwei
Partials (D1).

## Task 6: Tests-Partial (p6-bats-guards)

Ein BATS-Guard pro Vorgang, Output-Verifikation (T002448-M4) mit Positiv-Anker
(T002356-M1). Details in `tasks.d/p6-bats-guards.md`. Nach dem Schreiben der Tests:
`task test:inventory` regenerieren und `website/src/data/test-inventory.json` mitcommitten.

## Task 7: Finale Verifikation

- [ ] `task test:changed`
- [ ] `task freshness:regenerate`
- [ ] `task freshness:check`
