# p4 — repo-hygiene-cron.sh: Factory-Tick-Vorcheck (T003227)

## Ziel

Der Cron-Sweep (bzw. der manuelle Sweep über `scripts/repo-hygiene-cron.sh`) muss
vor der Worktree-Messung prüfen, ob ein Factory-Tick läuft — sonst ändern sich
Worktrees unter dem Lauf (beobachtet: 5 von 7 Worktrees in T003227).

## Steps

1. **RED.** Test in `tests/spec/batch-repo-hygiene-ops-fixes.bats` (in p5 geschrieben):
   bei tick_running=true wird die Worktree-Sektion übersprungen. `expected: FAIL`.

2. **GREEN.** In `scripts/repo-hygiene-cron.sh` (und falls der Sweep dort gekapselt ist):
   Vorcheck auf laufenden Factory-Tick (`scripts/factory/status.sh` / factory_status →
   tick_running=true) implementieren; bei laufendem Tick Worktree-Sektion überspringen
   oder die --porcelain-Prüfung unmittelbar vor dem Remove wiederholen.

3. **Verifikation.** Fall aus T003227: keine Remove-Entscheidung auf veraltetem Messstand.

## Acceptance

- Vorcheck auf tick_running implementiert.
- Messung unmittelbar vor dem Remove wiederholt (oder Worktree-Sektion übersprungen).
- Keine Remove-Entscheidung auf veraltetem Zustand.
