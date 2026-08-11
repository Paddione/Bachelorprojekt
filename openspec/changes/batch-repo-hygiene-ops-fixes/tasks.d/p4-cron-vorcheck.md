# p4 — repo-hygiene-cron.sh: Factory-Tick-Vorcheck (T003227) + pipefail-Abbruch

<!-- S1-Budget: scripts/repo-hygiene-cron.sh — Ist 185 - Baseline 0 -> Budget 615 frei (Limit 800) -->

## Ziel

Der Cron-Sweep (`scripts/repo-hygiene-cron.sh`) muss vor der Worktree-Messung prüfen,
ob ein Factory-Tick läuft — sonst ändern sich Worktrees unter dem Lauf (beobachtet:
5 von 7 Worktrees in T003227). **Zweiter, durch Test 10 aufgedeckter Defekt:** der
Cron bricht mit `set -euo pipefail` ab, wenn der Remote nur `main` hat — die
`remote_branch_count`-Pipeline (`git ls-remote | grep -v 'refs/heads/main$' | wc -l`)
liefert grep-Exit 1 bei leerem Ergebnis. Das ist dasselbe "leere Antwort ist kein
Urteil"-Muster wie T003109/T003074 und macht den Cron unbrauchbar für Repos mit
ausschließlich main-Branches.

## Ist-Stand (nach Teil-Implementierung c8e68ba97)

- Factory-Tick-Vorcheck (`tick_running()`, Lock-Test wie mcp-server.mjs) ist implementiert;
  bei laufendem Tick wird die Worktree-Sektion übersprungen und als `worktrees.skipped`
  ausgewiesen.
- Der pipefail-Abbruch ist NOCH OFFEN — Test 10 (`repo-hygiene-cron.sh überspringt die
  Worktree-Messung bei tick_running=true`) ist ROT: der Cron stirbt nach "collecting
  metrics" an der `remote_branch_count`-Pipeline, bevor die JSON-Ausgabe erreicht wird.

## Steps

1. **RED.** Test in `tests/spec/batch-repo-hygiene-ops-fixes.bats` (p5): bei
   tick_running=true wird die Worktree-Sektion übersprungen. Ist-Stand: ROT wegen
   pipefail-Abbruch (Exit 1 statt 0, keine JSON-Ausgabe).

2. **GREEN — pipefail-Fix (NEU, durch Test 10 belegt).** In `scripts/repo-hygiene-cron.sh`
   Z.~104 die `remote_branch_count`-Pipeline gegen grep-Exit-1 absichern, z.B.:
   ```bash
   remote_branch_count=$(git -C "$REPO_DIR" ls-remote --heads origin 2>/dev/null \
     | grep -v 'refs/heads/main$' || true | wc -l)
   ```
   oder per `if`-Guard. Kriterium: Cron läuft mit Exit 0 durch, wenn der Remote keine
   non-main-Branches hat (leerer Bestand = gültiger Messwert, kein Abbruch).

3. **GREEN — Tick-Vorcheck (T003227).** Vorcheck auf laufenden Factory-Tick
   (`/tmp/factory-tick.lock`-Locktest, Muster aus `scripts/factory/mcp-server.mjs`
   factory_status) ist implementiert; bei laufendem Tick Worktree-Sektion überspringen
   und als `worktrees.skipped` zählen.

4. **Verifikation.** Fälle aus T003227 und Test 10: keine Remove-Entscheidung auf
   veraltetem Messstand; Cron läuft auch bei leerem non-main-Bestand zu Ende.

## Acceptance

- Vorcheck auf tick_running implementiert (skipped-Zähler in der JSON-Ausgabe).
- Cron bricht bei leerem Remote-Bestand nicht mehr ab (Exit 0 + gültige JSON).
- Messung unmittelbar vor dem Remove wiederholt (oder Worktree-Sektion übersprungen).
- Keine Remove-Entscheidung auf veraltetem Zustand.
