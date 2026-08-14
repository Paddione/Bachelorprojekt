# Proposal: worktree-remove-claim-guard

## Why

**Symptom (beobachtet, reproduzierbar):** Der Worktree `.worktrees/mishap-incident-rollup`
wurde mitten in laufender Arbeit entfernt — `git worktree list` kannte ihn nicht mehr, nur
die frisch geschriebene Testdatei blieb zurück (2026-08-14, parallele Session aktiv).

**Ursache (belegt):** Der einzige dokumentierte Fremd-Remove-Pfad (dev-flow-plan Schritt −1,
„Stale Worktrees ggf. löschen: git worktree remove --force") prüft keine agent-lock-Claims;
der entfernte Worktree hatte keinen Claim. `pr-refresh.sh` removt nur eigene Worktrees,
`agent-lock.sh reap` prunet nur Lock-Dateien — beide unschuldig. Der Schutz fehlt im
Vorcheck: `scripts/worktree-clean-check.sh` (T002932) prüft nur DIRTY-Dateien, keine Claims.

## What

- `scripts/worktree-clean-check.sh`: nach dem Dirty-Check einen Claim-Check ergänzen —
  `agent-lock.sh check branch <branch>` (rc 3 = held) → Exit 1 mit Meldung.
- `.claude/skills/dev-flow-plan/SKILL.md` Schritt −1: vor dem Fremd-Remove den
  `worktree-clean-check.sh`-Claim-Guard verlangen.
- `scripts/factory/mishap-rollup.sh`: Zyklus-Worktree defensiv für die Laufdauer claimen
  (branch-scoped) und im trap releasen.
- Test: `tests/spec/dev-flow-plan/worktree-remove-claim-guard.bats` (RED belegt).

_Ticket: T005115_
