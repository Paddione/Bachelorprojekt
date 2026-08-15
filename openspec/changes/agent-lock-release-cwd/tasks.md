---
title: "agent-lock-release-cwd — Implementation Plan"
ticket_id: T006290
domains: [agent-skills, ci-tests]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# agent-lock-release-cwd — Implementation Plan

_Ticket: T006290_

## File Structure

```
scripts/agent-lock.sh                                       (geändert — cwd-Guard in cmd_release)
.claude/skills/git-workflow/SKILL.md                        (geändert — Schritt 7 Sequenz)
.claude/skills/references/session-coordination.md           (geändert — §Freigeben)
.claude/skills/dev-flow-chore/SKILL.md                      (geändert — Schritt 6 Sequenz)
tests/spec/active-sessions-hub/agent-lock-release-cwd.bats  (NEU — bereits im Plan-Commit, RED)
website/src/data/test-inventory.json                        (regeneriert)
openspec/changes/agent-lock-release-cwd/**                  (Proposal + Delta-Spec)
```

### Zeilenbudgets (S1, wirksame Schwelle)

| Datei | Ist | Budget |
| --- | --- | --- |
| `scripts/agent-lock.sh` | 783 | 17 |

`scripts/agent-lock.sh` ist **nicht gebaselined**; wirksame Schwelle ist das statische
Extension-Limit 800 aus `docs/code-quality/gates.yaml` (`.sh: 800`). Der Guard wurde als
kleine Helper-Funktion (`_cwd_inside_worktree`, nicht inline dupliziert) mit einem Zuwachs
von **20 Zeilen** (763 → 783) umgesetzt; das verbleibende Budget beträgt 17.

S1-Budget-Kommentare fuer die uebrigen geaenderten Dateien:

| Datei | Ist | Budget | Kommentar |
| --- | --- | --- | --- |
| `.claude/skills/git-workflow/SKILL.md` | 317 | — | `.md` hat kein S1-Limit in `gates.yaml`; nur Prosa-Umstellung im Code-Block von Schritt 7 |
| `.claude/skills/references/session-coordination.md` | 213 | — | `.md` hat kein S1-Limit in `gates.yaml`; nur stderr-Redirect + Reihenfolge in §Freigeben |
| `.claude/skills/dev-flow-chore/SKILL.md` | 213 | — | `.md` hat kein S1-Limit in `gates.yaml`; nur Reihenfolge in Schritt 6 |
| `tests/spec/active-sessions-hub/agent-lock-release-cwd.bats` | 113 (NEU) | — | neue Testdatei; `.bats` ist von S1 nicht erfasst (kein Limit in `gates.yaml`) |

## Partials

| # | Rolle | Zieldateien (disjunkt) |
| --- | --- | --- |
| p1 | Guard & Skills | `scripts/agent-lock.sh`, `.claude/skills/git-workflow/SKILL.md`, `.claude/skills/references/session-coordination.md`, `.claude/skills/dev-flow-chore/SKILL.md` |
| p2 | Tests & Inventar | `tests/spec/active-sessions-hub/agent-lock-release-cwd.bats`, `website/src/data/test-inventory.json` |

## Kontext für den Implementierer

Entwurfsentscheidung in `design.md` (D1) und bindend: `cmd_release` für Scope `branch`
**verweigert** (Exit 1), wenn der Lock ein `worktree`-Feld hat und `$PWD` des Aufrufers (oder
dessen git-Toplevel) innerhalb dieses Pfads liegt. Die Verweigerung nennt Grund und Remedie
(Release aus dem Haupt-Repo) auf stderr und lässt den Lock bestehen. `--force` bleibt der
bewusste Override. Der Containment-Test spiegelt `_lock_is_mine` (T003110): exakte oder
Präfix-Übereinstimmung auf `$PWD` UND `git rev-parse --show-toplevel` — ein Aufrufer in einem
Subverzeichnis des Worktrees wird ebenso verweigert wie einer an dessen Wurzel.

Skill-Sequenzen (D2): Release NACH `cd "$MAIN_REPO"` ausführen und die stderr-Unterdrückung
`2>/dev/null || true` entfernen, damit eine Verweigerung sichtbar bleibt. Wer beim
Implementieren meint, die Verweigerung sei doch nicht richtig, ändert nicht den Code, sondern
legt ein Folge-Ticket an.

## Task 1 (p2) — Failing-Test-Step (RED)

Die Testdatei liegt bereits im Plan-Commit dieses Branches. Sie muss vor der Implementierung
**rot** sein, und zwar an der jeweils inhaltlich richtigen Zusicherung (nicht am Fixture-Aufbau).

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/active-sessions-hub/agent-lock-release-cwd.bats
# expected: FAIL — 2 von 5 Tests rot:
#   1  Positiv-Anker (Release von ausserhalb) — gruen, Baseline
#   2  Release mit cwd im Worktree — ROT (status 0 statt 1, Lock wird entfernt)
#   3  Release aus Worktree-Subverzeichnis — ROT (status 0 statt 1)
#   4  --force-Override — gruen, noch ohne Guard trivial
#   5  ticket-Scope unveraendert — gruen
```

- [x] Lauf ausführen und die beiden Fehlermeldungen mit obiger Liste abgleichen. Weicht ein
      Fehlgrund ab, ist das Fixture defekt und wird zuerst repariert — nicht die Zusicherung
      abgeschwächt.

## Task 2 (p1) — cwd-Guard in cmd_release (agent-lock.sh)

Datei: `scripts/agent-lock.sh`, Funktion `cmd_release`.

- [x] Vor dem `rm -f` des Lock eine kleine Helper-Funktion (z. B. `_cwd_inside_worktree`)
      einführen, die den `worktree`-Wert des Locks (`_lock_field "$f" worktree`) gegen `$PWD`
      und `git rev-parse --show-toplevel` prüft — exakte oder Präfix-Übereinstimmung,
      Muster analog `_lock_is_mine` (Zeilen 281-299).
- [x] Guard nur für Scope `branch` aktivieren: Lock ohne nutzbares `worktree`-Feld (`-` oder
      leer) lässt den Release unverändert durchlaufen; `release ticket` bleibt unberührt.
- [x] Bei Verweigerung: Exit 1, stderr nennt Grund (cwd liegt im Worktree des Locks) und
      Remedie (Release aus dem Haupt-Repo heraus ausführen, weil der dokumentierte nächste
      Schritt `git worktree remove` die Shell-cwd zerstört).
- [x] `--force` (drittes Argument, bestehende Semantik) übersteuert den Guard wie die
      bestehende Fremd-Lock-Verweigerung.
- [x] Lock-Datei wird bei Verweigerung NICHT entfernt.
- [x] Zeilenbudget: Zuwachs in `scripts/agent-lock.sh` bleibt unter 37 Zeilen (Ist 763,
      Limit 800).

## Task 3 (p1) — Skill-Sequenzen: Release nach cwd-Wechsel, stderr sichtbar

Drei Dokumentationsstellen bilden die dokumentierte Freigabe-Sequenz; sie müssen den Release
nach dem Wechsel ins Haupt-Repo aufrufen und die Verweigerung nicht mehr verschlucken.

- [x] `.claude/skills/git-workflow/SKILL.md` Schritt 7 (Zeilen 262-295): den Freigabe-Block in
      die Sequenz NACH `cd "$MAIN_REPO"` ziehen und die `2>/dev/null || true`-Unterdrückung
      aus dem Code-Block entfernen.
- [x] `.claude/skills/references/session-coordination.md` §Freigeben (Zeilen 208-213): die
      beiden `release ... 2>/dev/null || true`-Zeilen ohne stderr-Redirect und nach dem
      Haupt-Repo-Wechsel dokumentieren.
- [x] `.claude/skills/dev-flow-chore/SKILL.md` Schritt 6 (Zeile 167): Reihenfolge so
      anpassen, dass der Release vor dem `git worktree remove` und nach dem Wechsel ins
      Haupt-Repo steht, ohne `|| true`.

## Task 4 (p2) — Testsuite gruen, Inventar regenerieren

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/active-sessions-hub/
# expected: PASS — alle Tests gruen, auch die bisher roten 2 und 3
task test:inventory
# regeneriert website/src/data/test-inventory.json (neue BATS-Datei)
git status --short
```

- [x] Grün-Phase verifizieren: alle 5 Tests der neuen Datei gruen, die übrigen Tests der
      Spec unveraendert gruen (kein Regressionstest).
- [x] `task test:inventory` ausführen; die regenerierte `website/src/data/test-inventory.json`
      in den Commit aufnehmen (CI-Job test-inventory check schlägt sonst fehl).

## Task 5 (p2) — Finale Verifikation

```bash
task test:changed
task freshness:regenerate
task freshness:check
bash scripts/plan-lint.sh openspec/changes/agent-lock-release-cwd/tasks.md
# expected: PASS
```

- [x] Alle vier Kommandos laufen ohne Fehler durch; die Tests grün, die Freshness-Artefakte
      auf Stand.
