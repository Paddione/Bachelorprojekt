---
title: "mishap-emission-rate — Implementation Plan"
ticket_id: T002383
domains: [bachelorprojekt-test]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# mishap-emission-rate — Implementation Plan

_Ticket: T002383_

Die Mishap-Schleife ist seit dem 26.07. nicht mehr konvergent: 32 Bundles am 27.07. erzeugt,
19 davon offen; 17 der 29 `triage`-Tickets sind Mishap-Bundles. Vollständige Messreihe und
Herleitung stehen in `proposal.md`.

Kern: Jeder dev-flow-Zyklus emittiert im Mittel ≥ 1 Bundle-Ticket, und jedes Bundle-Ticket
verbraucht einen Zyklus. Zwei Stellschrauben erzeugen das — die Bündelungsschwelle von 3 und
der erzwungene Flush am Session-Ende, der auch Ein-Eintrag-Bundles produziert (T002382 ist so
entstanden).

## File Structure

```
scripts/ticket-mcp/go/internal/tools/mishap.go   (geändert — MISHAP_TRIGGER 3 → 10)
.claude/skills/mishap-tracker/SKILL.md           (geändert — Schritt 3 umgeschrieben)
tests/spec/mcp-skill-integration.bats            (geändert — 3 Tests, bereits im Stage-Commit)
openspec/changes/mishap-emission-rate/specs/mcp-skill-integration.md   (neu — Delta-Spec)
```

## Verify (RED → GREEN)

- [x] **Failing-Test-Step (RED).** Die drei Tests liegen bereits im Stage-Commit dieses
      Branches in `tests/spec/mcp-skill-integration.bats` (Marker `T002383`): Schwellenwert
      ist 10; die Skill-Datei behauptet nicht mehr, am Session-Ende ginge etwas verloren; und
      sie erklärt stattdessen, dass der Buffer persistent ist. Der dritte Test ist die
      Gegenprobe zum zweiten — ohne ihn könnte der Absatz ersatzlos gelöscht werden und der
      Leser bliebe ratlos zurück.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/mcp-skill-integration.bats -f "T002383"
# expected: FAIL (rot — alle drei scheitern, weder Konstante noch Skill sind geändert)
```

- [x] **Fix-Step A (GREEN) — Schwelle anheben.** In
      `scripts/ticket-mcp/go/internal/tools/mishap.go` Zeile 20
      `const MISHAP_TRIGGER = 3` auf `10` setzen. Kein Test verankert derzeit den Wert 3, die
      Änderung ist einzeilig. Die Statusmeldungen ziehen automatisch mit, weil sie
      `MISHAP_TRIGGER` interpolieren (Zeilen 136, 177, 191, 209).

      Die Beschreibung des `flush_mishap_buffer`-Tools (Zeile 215) nennt die Schwelle als
      Literal „<3" im Fließtext — diese eine Stelle von Hand nachziehen.

- [x] **Fix-Step B (GREEN) — Session-Ende-Flush entfernen.** In
      `.claude/skills/mishap-tracker/SKILL.md` Schritt 3 ("Buffer am Ende flushen") umschreiben:
      Der unbedingte Flush bei < Schwelle entfällt. Der Satz „damit am Session-Ende nichts
      verloren geht" muss weg — er ist sachlich falsch, weil `mishapBufferPath()` den Buffer
      in `.git/mishap-buffer.json` schreibt und er damit Sessionwechsel überlebt.

      An seine Stelle gehört die Tatsache: Einträge dürfen liegen bleiben, sie werden vom
      nächsten `report_mishap` mitgezählt. Sonst stellt der nächste Leser den Flush aus Sorge
      vor Datenverlust wieder her.

      **Der Aufruf `flush_mishap_buffer` muss in der Datei erwähnt bleiben** — der
      Bestandstest „mishap-tracker skill references flush_mishap_buffer" (dieselbe Datei,
      weiter oben) greppt darauf. Er bleibt als *bewusster* manueller Schnitt dokumentiert,
      nur nicht mehr als Pflichtschritt.

- [x] **Aufrufende Skills prüfen.** `dev-flow-plan`, `dev-flow-execute`, `dev-flow-chore`,
      `infra-ops`, `incident-response` und `ticket-ops` verweisen auf den mishap-tracker.
      Vor der Kürzung die Test-Kopplung prüfen, sonst reißen Ketten (T001441/T002181):

```bash
grep -rl 'mishap-tracker/SKILL.md' tests/
grep -rn 'flush_mishap_buffer' .claude/skills/
```

- [x] **Periodischen Flush ergänzen.** Damit der Buffer nicht unbegrenzt wächst, einen
      periodischen Schnitt vorsehen — naheliegend im Factory-Tick (`scripts/factory/wakeup.sh`,
      analog zu `auto-enqueue`/`auto-triage`) oder als eigener Task. Ein Buffer, der nur noch
      bei Erreichen von 10 leert, ist andernfalls bei niedriger Aktivität unbegrenzt alt.

- [x] **Nebenbefund verifizieren: Worktree-Pfad.** `mishapBufferPath()` baut
      `filepath.Join(runner.RepoRoot(), ".git", "mishap-buffer.json")`. In einem git-Worktree
      ist `.git` eine **Datei**, kein Verzeichnis — dort könnte das Schreiben still
      fehlschlagen und Mishaps aus Worktree-Sessions verlieren. Prüfen und, falls bestätigt,
      auf `git rev-parse --git-common-dir` umstellen. Falls nicht bestätigt: den Grund im
      Ticket vermerken, nicht stillschweigend übergehen.

```bash
cd .worktrees/<irgendein-worktree> && ls -la .git && test -f .git && echo ".git ist eine DATEI — Pfad-Annahme gebrochen"
```

- [x] **Wirksamkeit sicherstellen — Binary neu bauen.** Das `ticket-mcp-go`-Binary ist
      **gitignored** (`scripts/ticket-mcp/.gitignore`) und wird per Task nach
      `/usr/local/bin` installiert. Der Merge allein ändert den laufenden MCP-Server **nicht**;
      die Schwelle bliebe bei 3, bis jemand neu baut. Nach dem Merge:

```bash
task ticket-mcp:build
# Gegenprobe: die Statusmeldung muss die neue Schwelle nennen
# (report_mishap antwortet dann "1/10", nicht "1/3")
```

- [x] **Final Verification.** Die drei verpflichtenden CI-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
