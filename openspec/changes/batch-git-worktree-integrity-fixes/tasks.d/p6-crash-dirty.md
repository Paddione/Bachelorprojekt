# p6 — Crash-Dirty: erster git status nach Crash nicht falsch-positiv (T002995)

## Ziel

Der erste `git status` nach einem Crash meldet Falsch-Positiv "dirty" —
Vorcheck in repo-hygiene §1 misst den falschen Zustand.

## Steps

1. **RED.** Test in `tests/spec/batch-git-worktree-integrity-fixes.bats`: nach simuliertem
   Crash (abgebrochene git-Operation) meldet git status nicht falsch "dirty".
   `expected: FAIL`.

2. **GREEN.** In `scripts/git-worktree-health.mjs` (neu, oder im bestehenden
   Vorcheck-Pfad): Index- vs. Working-Tree-Zustand robust auswerten — abgebrochene
   git-Operationen hinterlassen Lockfiles/Index-Marker, die als dirty fehlinterpretiert
   werden; diese Fälle erkennen und als clean melden. §1-Doku: zweimal messen
   (unmittelbar vor Remove).

3. **Verifikation.** Fall aus T002995: erster status nach Crash ist korrekt.

## Acceptance

- Kein Falsch-Positiv "dirty" nach abgebrochener git-Operation.
- Vorcheck misst den zum Entscheidungszeitpunkt gültigen Zustand.
