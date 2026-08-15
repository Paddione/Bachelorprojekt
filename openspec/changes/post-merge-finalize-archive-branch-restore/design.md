---
ticket_id: T006791
plan_ref: openspec/changes/post-merge-finalize-archive-branch-restore/tasks.md
status: active
date: 2026-08-15
---

# Design: Branch-Restore der Archiv-Sektion (T006791)

## Root-Cause-Analyse (belegt)

**Symptom (Fakt):** Nach einem Lauf der Archiv-Sektion (Schritt 8) von
`scripts/devflow-post-merge-finalize.sh` steht der Arbeitsbaum dauerhaft auf dem
Archiv-Branch `chore/plan-archive-<slug>-<ticket>` statt auf dem vorherigen Branch.
Betroffen ist der geteilte Arbeitsbaum: `ARCHIVE_DIR` ist entweder der Worktree
(`$WORKTREE`) oder das **Haupt-Checkout** (`$REPO_DIR`) — T002357-Fallenklasse.

**Beleg:** `git show origin/main:scripts/devflow-post-merge-finalize.sh | grep -c
ARCHIVE_PREV_BRANCH` → 0. Die Archiv-Sektion (Z. 216–246) läuft in einer Subshell mit
`git checkout -B "$ARCHIVE_BRANCH" origin/main` (Z. 229) ohne Restore. Der
BATS-Guard `tests/spec/agent-skills/post-merge-finalize-guards.bats` Assertion 5
(ARCHIVE_PREV_BRANCH) ist gegen main rot; auf main liegt sie als `skip` mit Verweis auf
T006791 (via PR #4579).

**Hypothese vs. Ursache:** Die Ticket-Beschreibung nennt als Ursache „Restore fehlt".
Verifiziert: Der T006348-Plan (Befund 2) deklarierte zwei Teile — (a) ls-remote-Skip
(implementiert, PR #4572) und (b) `ARCHIVE_PREV_BRANCH` merken + zurückschalten
(NICHT implementiert). Der Fix ist damit nicht eine neue Erfindung, sondern die
nachgeholte Hälfte einer dokumentierten Entscheidung.

## Fix-Ansatz

1. Vor der Archiv-Sektion (im `else`-Zweig, nach dem ls-remote-Skip) den aktuellen
   Branch merken:
   `ARCHIVE_PREV_BRANCH="$(git -C "$ARCHIVE_DIR" rev-parse --abbrev-ref HEAD)"`.
2. In der Subshell eine EXIT-Trap registrieren, die den Branch zurückschaltet —
   `trap` deckt den Happy-Path (nach Push/PR) UND die Fehlerpfade ab (gh pr create /
   gh pr merge FATAL → Subshell exit 1): In jedem Fall endet die Subshell auf dem
   gemerkten Branch.
3. No-op-Schutz: Restore nur, wenn `HEAD != ARCHIVE_PREV_BRANCH`.
4. Restore-Fehler → `FATAL`-Meldung auf stderr und Exit 1 (kein stiller Erfolg,
   kein Ticket-`done` mit gewechseltem Arbeitsbaum).

### Warum Subshell-Trap statt Restore im Hauptfluss?

Der Restore NACH der Subshell im Hauptfluss (naheliegende Variante) deckt nur den
Happy-Path: `set -euo pipefail` beendet das Skript bei einem Fehler in der Subshell
(z. B. `gh pr create` FATAL) sofort — der Restore im Hauptfluss liefe nie, und genau
der Fehlerfall ist die gefährlichste T002357-Variante (Skript bricht ab, Arbeitsbaum
bleibt auf dem Archiv-Branch, der geteilte Checkout ist für parallele Sessions
kaputt). Die Trap läuft bei jedem Subshell-Exit.

## Edge Cases

| Fall | Verhalten |
|---|---|
| Archiv-Branch existiert bereits remote | ls-remote-Skip — kein Branch-Wechsel, PREV wird nicht gemerkt, keine Subshell, kein Restore |
| Fehler VOR `git checkout -B` (openspec.sh archive, commit) | kein Branch-Wechsel; Trap-Restore ist No-op (HEAD == PREV) |
| Fehler NACH `git checkout -B` (cherry-pick, push, pr create, merge) | Trap restauriert trotzdem; Subshell-Exit-Code bleibt 1 |
| `ARCHIVE_DIR == $REPO_DIR` (Haupt-Checkout) | `git -C "$ARCHIVE_DIR"` wirkt auf denselben Checkout — Restore greift |
| `ARCHIVE_DIR == $WORKTREE` | `git -C "$WORKTREE"` — geteiltes .git, Restore greift |
| Restore schlägt fehl (z. B. PREV-Branch zwischenzeitlich gelöscht) | `FATAL` auf stderr, Skript endet mit Exit 1 — kein falsches done |

## Test-Strategie

- Assertion 5 in `tests/spec/agent-skills/post-merge-finalize-guards.bats`:
  `skip` entfernen → `grep -qF 'ARCHIVE_PREV_BRANCH' "$FINALIZE"` (Source-Grep-Modus,
  dokumentierte Ausnahme von T002448-M4: der Laufzeitpfad braucht Cluster/DB).
- Rot-Grün: Assertion rot gegen main (Variable fehlt), grün nach dem Fix.
- Lokale Verifikation: `bats tests/spec/agent-skills/post-merge-finalize-guards.bats`
  (8 Tests grün).
