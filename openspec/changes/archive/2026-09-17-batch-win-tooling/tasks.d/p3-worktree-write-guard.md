# p3 — Worktree-Write-Guard: Fail-Closed auf geloeschtem Worktree

## Child-Ticket
- T900066: Gesperrter Worktree wurde mitten im Lauf geloescht — git-Befehle liefen still gegen den Hauptbaum

## Problem
Ein geloeschter Worktree (`.git`-Datei verschwunden) laeuft git-Befehle **still** gegen den Hauptbaum — ohne Fehlermeldung. Ein `git commit` aus dem "vermeintlichen" Worktree heraus geht gegen einen fremden Branch. Der existierende `worktree-prune-safe.sh` schuetzt nur vor `git worktree prune`, aber nicht vor direktem Loeschen des worktree-Contents.

## Tasks

### 3.1 Write-Guard-Analyse
- `scripts/hooks/worktree-write-guard.sh` — bestehenden Guard analysieren
- Verstehen, wann der Guard feuert und wann nicht
- `worktree-prune-safe.sh` — bestehender Prune-Guard (a623e9939)

### 3.2 Fail-Closed-Guard implementieren
Neue Funktion `worktree_write_guard_verify()` die prueft:
1. Ist `git rev-parse --git-dir` im aktuellen Verzeichnis gleich dem erwarteten Worktree-gitdir?
2. Ist `git rev-parse --git-common-dir` konsistent mit dem expected common-dir?
3. Gibt es ein `.worktrees/<name>`-Metadaten-File und ist es noch aktuell?
4. Wenn Abweichung → **LAUT SACHEITERN** mit klarem Error-Message und exit 1

Integration: In `worktree-write-guard.sh` als ersten Guard vor jedem Commit/Write.

### 3.3 Lock-Status-Pruefung
- Vor Loeschung eines Worktrees muss der `locked`-Status im `.git/worktrees/<id>/` Verzeichnis ueberprueft werden
- Kandidaten fuer Loeschungs-Ursachen dokumentieren (Hygiene-Skripte, Reaper, Factory-Cleanup)
- Schutz gegen Loeschung von `locked` Worktrees ergaenzen

### 3.4 Tests
- `tests/spec/worktree-write-guard.bats` — bestehende Tests ergaenzen:
  - Test: geloeschter Worktree → write guard scheitert laut
  - Test: normaler Worktree → write guard durchlaeuft
  - Test: locked worktree → prune safe funktioniert
- Manueller Test-Szenario dokumentieren

## Acceptance Criteria
- Worktree mit weggebrochener `.git`-Datei: jeder git-Befehl scheitert laut (nicht still)
- Lock-Status wird vor Prune beruecksichtigt (bestehend aus a623e9939 bleibt)
- Error-Message zeigt exakt was falsch ist und wie es repariert werden kann
- Alle bestehenden Tests (worktree-cross-platform.bats, worktree-write-guard.bats) bestehen

## Target Spec
- `openspec/specs/scripts.md` — delta: worktree-write-guard Verhaltnis
- `openspec/specs/agent-skills.md` — delta: fail-closed-worktree-prerequisite

## Dependencies
- Keiner — eigenständig implementierbar
