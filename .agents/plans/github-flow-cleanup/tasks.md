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
- `tests/py/spec/native_ported/spec/agent-skills/test_post_merge_finalize_safety.py` — native CI-Regression inkl. echter eigener/fremder Claims.

## S1-Budgets

Budgets vor Implementierung mit plan-lint residual_budget erneut messen; beide bestehenden
Dateien liegen unter dem geltenden Limit. Neue Tests bleiben unter dem BATS-Limit.
Keine Baseline-Einträge hinzufügen. Shared-Remove-Helper bleibt unverändert.

## Phase 1 — RED sichern

- [x] Squash-Merge mit identischen Trees und belegtem PR-Head reproduzieren.
- [x] Dirty tracked/untracked Arbeit, dirty Allowlist-Pfad, fremde branch/ticket Claims
      und unbekannten Claimstatus vor Remove reproduzieren.
- [x] Run `bats tests/spec/agent-skills/post-merge-finalize-safety.bats` Expected: FAIL before implementation; RED dokumentieren.

## Phase 2 — Merge-Evidenz

- [x] In `scripts/lib/finalize-step-guards.sh` tatsächlichen Zielbranch frisch fetchen; fehlende Prüfbarkeit verhindert Cleanup.
- [x] Normalen Merge via Abstammung akzeptieren. Squash nur mit MERGED-PR, exakt passendem
      Head-Branch, headRefOid==lokalerTip und Merge-Commit im geprüften Zielbranch akzeptieren.
- [x] Spätere Feature-Commits, falschen PR/Target und GitHub-Ausfall sicher behalten.

## Phase 3 — Cleanup schützen

- [x] In `scripts/devflow-post-merge-finalize.sh` vor Schritt-10-Mutationen branch-exakte Zuordnung und Merge-Nachweis prüfen.
- [x] worktree-clean-check für Sessionprüfung wiederverwenden; vollständigen git status
      zusätzlich prüfen, damit keine Allowlist-Dateien verworfen werden.
- [x] Fremde oder unbekannte Claims verhindern Cleanup. Bei Befund Worktree und Branch
      erhalten; destruktive Folgeschritte inklusive Reaper überspringen.
- [x] cwd-Reanchor und Idempotenz bewahren; Branchdelete erst nach erfolgreichem Remove.

## Phase 4 — Verifikation und PR

- [x] Neue Regression und bestehende Finalizer-/Guard-Suiten laufen lassen: `tests/py/spec/native_ported/spec/agent-skills/test_post_merge_finalize_safety.py` plus BATS.
- [x] Bash-Syntax, Plan-Lint und S1–S4 prüfen; keine fremden Worktrees entfernen.
- [x] task test:inventory ausführen.
- [x] task test:changed ausführen (Gesamtsuite läuft, rote Alt-Fixtures werden separat berichtet).
- [x] task freshness:regenerate ausführen, Artefakte committen.
- [x] task freshness:check ausführen (Exit 0, keine neuen Baseline-Keys).
- [ ] PR erstellen, Belege dokumentieren; Merge und Archivierung im regulären Flow.

## Implementierungsbelege

RED: neue BATS vor Implementierung: 6/7 fehlgeschlagen; Squash-Fixture master
wurde nicht erkannt, Cleanup-Guard fehlte. Danach 16/16 BATS grün.
Native CI-Regression zusätzlich nötig, da BP BATS seit T901392 nicht in CI fährt:
15/15 pytest grün mit echten Git-Repos und echten agent-lock-Claims.
23/23 bestehende Finalizer-native Tests vor Claim-Phasentrennung grün.
Cleanup: Merge/Dirty/Ownership vor eigener SID-exakter Claimfreigabe; danach
konservativer worktree-clean-check, Dirty/Tip-Recheck und Remove ohne force.
Blockierter Cleanup endet mit Exit 1; fremde Claims bleiben erhalten.
