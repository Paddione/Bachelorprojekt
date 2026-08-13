---
title: "Batch: Git/Worktree-Integrität — 7 Fixes (T002994, T002995, T002998, T003069, T003070, T003105, T003131)"
ticket_id: "T003539"
domains: [git, scripts, worktrees, skills, hooks]
status: plan_staged
partials: 4
---

# batch-git-worktree-integrity — Implementation Plan

## File Structure

### Geänderte Dateien (S1: Ist - Baseline -> Budget laut docs/code-quality/baseline.json)
- `scripts/worktree-clean-check.sh` — P1: Dirty-Befund durch zweite Messung bestätigen (T002995). S1: Ist 50, kein Baseline-Eintrag -> Budget 750 (Limit 800)
- `.claude/skills/references/repo-hygiene-ops.md` — P1: §0 Integritäts-Vorcheck + Rettungssequenz (T002994), §1 Zweitmessung + Orphan + Porcelain (T002995/T002998), §0 Stash-Inventar Shared-Stack-Notiz (T003070). Kein S1-Limit (Markdown)
- `.claude/skills/references/ticket-ops-procedures.md` — P1: Worktree-Schleife auf `git worktree list --porcelain` + `.git`-Guard (T002998). Kein S1-Limit (Markdown)
- `.claude/skills/git-workflow/SKILL.md` — P2: Stash-Pop-Verifikation (T003069), Stash-Disziplin (T003070), Freshness-nach-Rebase (T003105). Kein S1-Limit (Markdown)
- `.opencode/skills/opencode-git-workflow/SKILL.md` — P2: dieselben drei Skill-Regeln (opencode-Variante). Kein S1-Limit (Markdown)
- `scripts/worktree-create.sh` — P2: Auto-Stash per Nachricht statt `stash@{0}` poppen (T003070). S1: Ist 568, kein Baseline-Eintrag -> Budget 232 (Limit 800)
- `scripts/hooks/worktree-write-guard.sh` — P3: `_my_sid`-Parität inkl. `OPENCODE_SESSION_ID`, Meldung mit Besitz-Quelle (T003131). S1: Ist 192, kein Baseline-Eintrag -> Budget 608 (Limit 800)
- `scripts/agent-lock.sh` — P3: keine Verhaltensänderung, nur Regressionstest-Festigung der SID-Felder (T003131). S1: Ist 694, kein Baseline-Eintrag -> Budget 106 (Limit 800)

### Neue Dateien (S1-Limit 800)
- `scripts/git-worktree-health.sh` — P1: `objects`- und `orphans`-Vorcheck mit Exit-Code-Kontrakt (T002994, T002998)
- `scripts/git-stash-net.sh` — P2: nachrichtenbasierte Stash-Operationen `find --by-ticket` / `pop --by-message` (T003070)
- `tests/spec/batch-git-worktree-integrity.bats` — P4: RED-Tests für alle 7 Fixes

### Bewusst nicht geändert
- `scripts/branch-reaper.sh` — analysiert (T002994–T003131): keine stash-/worktree-/status-Berührung, kein Fixpunkt
- `scripts/worktree-git-op-guard.sh` — bereits Porcelain-basiert (T002766), bleibt Referenz
- `.gitattributes` — `merge=ours` bleibt; T003105-Fix liegt in der Workflow-Regel

## Partials

| # | Pfad | Rolle | Targets | Deps |
|---|------|-------|---------|------|
| P1 | `tasks.d/p1-worktree-health-hygiene.md` | impl | `scripts/git-worktree-health.sh`, `scripts/worktree-clean-check.sh`, `.claude/skills/references/repo-hygiene-ops.md`, `.claude/skills/references/ticket-ops-procedures.md` | |
| P2 | `tasks.d/p2-git-workflow-stash-rebase.md` | impl | `.claude/skills/git-workflow/SKILL.md`, `.opencode/skills/opencode-git-workflow/SKILL.md`, `scripts/git-stash-net.sh`, `scripts/worktree-create.sh` | |
| P3 | `tasks.d/p3-write-guard-ownership.md` | impl | `scripts/hooks/worktree-write-guard.sh`, `scripts/agent-lock.sh` | |
| P4 | `tasks.d/p4-tests.md` | tests | `tests/spec/batch-git-worktree-integrity.bats` | |

## Verify

1. `bash scripts/plan-lint.sh openspec/changes/batch-git-worktree-integrity/tasks.md` → PASS
2. `bash scripts/openspec.sh validate` → OK
3. `bash tests/unit/lib/bats-core/bin/bats tests/spec/batch-git-worktree-integrity.bats` → RED vor P1–P3, GREEN nach P1–P3
4. `task test:changed` → grün
5. `task freshness:regenerate` → Artefakte aktuell
6. `task freshness:check` → keine stale Artefakte
