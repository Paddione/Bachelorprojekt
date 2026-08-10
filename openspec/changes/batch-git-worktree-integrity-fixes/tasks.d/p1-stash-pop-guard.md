# p1 — stash pop nach Rebase: teilweiser Durchlauf erkennbar (T003069)

## Ziel

Ein teilweise durchgelaufener `git stash pop` nach Rebase sieht aus wie ein
erfolgreicher — der Rest bleibt still im Stash, Änderungen gehen fast verloren.

## Steps

1. **RED.** Test in `tests/spec/batch-git-worktree-integrity-fixes.bats`: teilweiser
   stash pop (Konflikt) wird als solcher gemeldet. `expected: FAIL`.

2. **GREEN.** In `scripts/worktree-git-op-guard.sh` (bzw. dem Rebase-Workflow): stash pop
   auf Vollständigkeit prüfen — `git stash list` VOR/NACH vergleichen; verbleibender
   Eintrag → klare Warnung "stash pop unvollständig", kein stiller Erfolg.

3. **Verifikation.** Fall aus T003069: teilweiser pop meldet den Restbestand.

## Acceptance

- Teilweiser stash pop wird als unvollständig gemeldet.
- Kein stiller Erfolg mit verlorenem Rest.
