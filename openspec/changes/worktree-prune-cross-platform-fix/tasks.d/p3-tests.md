---
title: "p3 — Tests: worktree-cross-platform.bats"
status: pending
depends_on: [p1]
---

# p3 — Tests: worktree-cross-platform.bats

## Aufgabe

Erstelle `tests/spec/worktree-cross-platform.bats` mit Tests, die die Plattform-Erkennung
und das Prune-Verhalten von `worktree_prune_safe` verifizieren.

## Tests

### T900046-M1: WSL-Erkennung bei WSL-exec-path

- Mock `git --exec-path` mit einem WSL-Pfad (z.B. `/wsl.localhost/Ubuntu/usr/lib/git-core/git`)
- Rufe `worktree_prune_safe` auf
- **Ergebnis:** `expected: FAIL` im Plan-Stadium, weil die WSL-Logik noch nicht implementiert ist
- **Nach Fix:** Test PASS — Funktion erkennt WSL und überspringt Windows-Worktrees

### T900046-M2: WSL-Erkennung via osrelease

- Simuliere `/proc/sys/kernel/osrelease` mit Inhalt `5.15.0-Microsoft-standard-WSL2`
- Rufe `worktree_prune_safe` auf
- **Ergebnis:** WSL-Modus wird aktiviert

### T900046-M3: Native Plattform (kein WSL)

- Kein WSL-Signal gesetzt (`git --exec-path` zeigt `/usr/lib/git-core/git` oder Windows-Pfad)
- `/proc/sys/kernel/osrelease` nicht vorhanden oder kein Microsoft/WSL
- Rufe `worktree_prune_safe` auf
- **Ergebnis:** `git worktree prune` wird direkt ausgeführt

### T900046-M4: Prune mit unerreichbarem Worktree wird übersprungen

- Erstelle einen simulierten Worktree-Eintrag mit Windows-path in `gitdir`
- Stelle sicher, dass der Pfad aus WSL-Sicht nicht lesbar ist
- Rufe `worktree_prune_safe` auf
- **Ergebnis:** Der unerreichbare Worktree wird NICHT vom Prune erfasst

### T900046-M5: Prune mit erreichbarem Worktree durchläuft

- Erstelle einen simulierten Worktree-Eintrag mit WSL-path in `gitdir`
- Stelle sicher, dass der Pfad aus WSL-Sicht lesbar ist
- Rufe `worktree_prune_safe` auf
- **Ergebnis:** Der erreichbare Worktree wird vom Prune erfasst

### T900046-M6: Non-fatal — exit code 0 bei allen Fehlern

- Simuliere verschiedene Fehlerzustände (fehlende gitdir, permission denied, etc.)
- Rufe `worktree_prune_safe` auf
- **Ergebnis:** Immer exit 0, keine propagierten Fehler

## Akzeptanzkriterien

- [ ] Alle 6 Tests (M1–M6) existieren als BATS-Tests
- [ ] Tests verwenden BATS-Mocks für Git/Dateisystem
- [ ] Alle Tests bestehen nach Implementierung von p1+p2
