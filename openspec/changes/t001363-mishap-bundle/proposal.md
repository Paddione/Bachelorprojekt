# Proposal: t001363-mishap-bundle

## Why

Mishap-Bundle mit 3 gemeldeten Einträgen (git-worktree, `dev-flow-execute`, git-crypt). Audit vor der
Implementierung ergab:

1. **git-worktree**: `scripts/agent-lock.sh reap` prunt bereits verwaiste `git worktree`-Admin-Einträge
   und killt Orphan-Prozesse toter Worktrees (siehe `reap()` in `scripts/agent-lock.sh`). **Kein Gap.**
2. **`dev-flow-execute`**: Das Skill (`.claude/skills/dev-flow-execute/SKILL.md`) geht ab Schritt 0 davon
   aus, dass ein Worktree bereits existiert (von `dev-flow-plan` übergeben), prüft das aber nie explizit
   und ruft `scripts/worktree-create.sh` an keiner Stelle auf. Läuft die Execute-Phase versehentlich im
   Haupt-Checkout statt im Worktree (z.B. nach einem Session-Neustart), schreibt der Implementer-Subagent
   direkt ins Haupt-Repo. **Echter Gap.**
3. **git-crypt**: `scripts/git-crypt-guard.sh check-tracked` läuft aktuell grün (exit 0) — keine
   Klartext-Secrets in verwalteten Pfaden. **Kein Gap**, aber es fehlt ein Regressions-Test, der das
   dauerhaft absichert.

## What

1. `dev-flow-execute` SKILL.md Schritt 0 erweitern: explizite Prüfung, ob `$PWD` unter einem
   `tmp/wt-*`-Worktree-Pfad liegt; falls nicht, `scripts/worktree-create.sh <branch> tmp/wt-<slug>`
   aufrufen, bevor implementiert wird.
2. Regressions-Guard-Tests für alle 3 Einträge in `tests/spec/t001363-mishap-bundle.bats` (Pattern:
   `tests/spec/mishap-bundle-2026-06-30.bats`) — grep-basierte Assertions, die den aktuellen (bereits
   guten) Zustand von Punkt 1 und 3 dauerhaft absichern, plus Test für den neuen Worktree-Check in
   Punkt 2.

## Non-Goals

- Keine git-crypt → SealedSecrets Migration (das ist ein eigenständiges, großes Vorhaben — außerhalb des
  2h-Task-Scopes einer Mishap-Bundle-Fix-PR).

_Ticket: T001363_
