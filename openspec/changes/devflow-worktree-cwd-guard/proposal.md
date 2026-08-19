# Proposal: devflow-worktree-cwd-guard

## Why

Mishap-Fix T006367: In einer Runde liefen `git commit` (Docs-Fix T006330) und
`preflight-pr-scope.sh` im **Hauptcheckout** statt im Fix-Worktree — das Bash-cwd stand
nach vorherigen Befehlen im Hauptcheckout, und die dev-flow-Skills vertrauen bei ihren
Git-Aufrufen auf das implizite cwd. Beide Male ohne Schaden, aber der Commit-Versuch
hätte auf einem fremden Branch landen können (Staged-Dateien einer Parallelsession).

Die bestehenden T002357-Notizen ("`cd` wirkt nur auf Bash") decken nur
**Datei-Tool-Pfade** (Read/Write/Edit) ab. Der Bash-Git-Aufruf selbst — `git add`,
`git commit`, `git push`, `preflight-pr-scope.sh` — ist nicht abgesichert und erscheint
in sieben Skill-Dateien (Claude-Code- und opencode-Varianten von dev-flow-plan/execute/
chore) als bare Form ohne `-C` und ohne cd+Guard.

## What

1. **Prominente Regel** in allen betroffenen dev-flow-Skills (und der
   dev-flow-plan-phases-Referenz): Bash-Aufrufe in dev-flow-Phasen IMMER mit
   `git -C <worktree>` bzw. explizitem cd+guard — **nie auf implizites cwd vertrauen**
   (kanonische Phrase, vom Guard-Test geprüft).
2. **Beispielformen**: Commit-/Push-/Preflight-Blöcke in den Skills werden auf die
   `git -C "$WT" …`-Form oder `cd "$WT" && [ "$(git rev-parse --show-toplevel)" = "$PWD" ]`
   umgestellt.
3. **Neues Requirement** im SSOT-Spec `openspec/specs/agent-skills.md` (Delta),
   das die Pflicht als Konvention festschreibt.
4. **Guard-Test** `tests/spec/agent-skills/devflow-worktree-cwd-guard.bats`
   (Dokumentations-Konvention → grep-Modus, Positiv-Anker): rot, solange die
   Regel-Phrase in den betroffenen Dateien fehlt; grün, wenn sie überall steht.

_Ticket: T006367_
