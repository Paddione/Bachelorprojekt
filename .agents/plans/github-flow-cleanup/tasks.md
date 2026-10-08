---
title: "github-flow-cleanup — Implementation Plan"
ticket_id: T901525
domains: [agent-skills, scripts]
status: draft
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# github-flow-cleanup — Implementation Plan

Squash-Merges hinterlassen lokale Branches: der Finalizer prüft nur Commit-Abstammung.
Schritt 10 entfernt Worktrees mit force ohne Prüfung fremder Claims oder uncommitteter Arbeit.
Reale temporäre Git-Fixtures belegen beide RED-Fälle. Dieser Fix prüft Merge-Evidenz,
Branch-Zuordnung, vollständigen Dirty-Status und Claims vor jeder Cleanup-Mutation.
Gateway und fremde Worktrees bleiben außerhalb des Scopes.

## File Structure

- `scripts/lib/finalize-step-guards.sh` — sichere Merge- und Cleanup-Guards.
- `scripts/devflow-post-merge-finalize.sh` — Cleanup erst nach bestandenen Guards.
- `tests/spec/agent-skills/post-merge-finalize-safety.bats` — echte Git-Fixtures.

## S1-Budgets

Budgets vor Implementierung mit plan-lint residual_budget erneut messen; beide bestehenden
Dateien liegen unter dem geltenden Limit. Neue Tests bleiben unter dem BATS-Limit.
Keine Baseline-Einträge hinzufügen. Shared-Remove-Helper bleibt unverändert.

## Phase 1 — RED sichern

- [ ] Squash-Merge mit identischen Trees und belegtem PR-Head reproduzieren.
- [ ] Dirty tracked/untracked Arbeit, dirty Allowlist-Pfad, fremde branch/ticket Claims
      und unbekannten Claimstatus vor Remove reproduzieren.
- [ ] Run `bats tests/spec/agent-skills/post-merge-finalize-safety.bats` Expected: FAIL before implementation; RED dokumentieren.

## Phase 2 — Merge-Evidenz

- [ ] In `scripts/lib/finalize-step-guards.sh` tatsächlichen Zielbranch frisch fetchen; fehlende Prüfbarkeit verhindert Cleanup.
- [ ] Normalen Merge via Abstammung akzeptieren. Squash nur mit MERGED-PR, exakt passendem
      Head-Branch, headRefOid==lokalerTip und Merge-Commit im geprüften Zielbranch akzeptieren.
- [ ] Spätere Feature-Commits, falschen PR/Target und GitHub-Ausfall sicher behalten.

## Phase 3 — Cleanup schützen

- [ ] In `scripts/devflow-post-merge-finalize.sh` vor Schritt-10-Mutationen branch-exakte Zuordnung und Merge-Nachweis prüfen.
- [ ] worktree-clean-check für Sessionprüfung wiederverwenden; vollständigen git status
      zusätzlich prüfen, damit keine Allowlist-Dateien verworfen werden.
- [ ] Fremde oder unbekannte Claims verhindern Cleanup. Bei Befund Worktree und Branch
      erhalten; destruktive Folgeschritte inklusive Reaper überspringen.
- [ ] cwd-Reanchor und Idempotenz bewahren; Branchdelete erst nach erfolgreichem Remove.

## Phase 4 — Verifikation und PR

- [ ] Neue Regression und bestehende Finalizer-/Guard-BATS-Suiten laufen lassen.
- [ ] Bash-Syntax, Plan-Lint und S1–S4 prüfen; keine fremden Worktrees entfernen.
- [ ] task test:inventory ausführen.
- [ ] task test:changed ausführen.
- [ ] task freshness:regenerate ausführen, Artefakte committen.
- [ ] task freshness:check ausführen.
- [ ] PR erstellen, Belege dokumentieren; Merge und Archivierung im regulären Flow.
