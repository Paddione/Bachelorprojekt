---
title: "fix-plan-lint-s1-ignore-T002270 — Implementation Plan"
ticket_id: T002270
domains: [infra]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# fix-plan-lint-s1-ignore-T002270 — Implementation Plan

_Ticket: T002270_

Ursache und Design-Entscheidung stehen in `proposal.md` im selben Ordner. Kurzfassung:
`plan-lint.sh` liest aus `gates.yaml` nur `s1.limits`, nie `s1.ignore`, und rechnet
deshalb für bewusst ausgenommene Dateien ein tief negatives Budget aus.

## File Structure

| Datei | Ist-Zeilen | S1-Budget |
|-------|-----------|-----------|
| `scripts/plan-lint.sh` | 387 | 113 |
| `tests/unit/plan-lint.bats` | 182 | S1 kennt kein Limit für `.bats` |
| `tests/unit/fixtures/plan-lint/s1-ignored-file.md` | 44 | S1 kennt kein Limit für `.md` |
| `tests/unit/fixtures/plan-lint/s1-ignored-with-budget.md` | neu | S1 kennt kein Limit für `.md` |

<!-- vitest: kein neuer Test nötig, weil die Änderung ausschließlich Bash betrifft und
     keine Datei unter website/src/ anfasst. -->

## Task 1 — RED (bereits auf dem Branch)

Die beiden Reproduktions-Tests und ihre Fixture sind mit dem Stage-Commit dieses
Branches bereits vorhanden: `tests/unit/plan-lint.bats` (Abschnitt „T002270") und
`tests/unit/fixtures/plan-lint/s1-ignored-file.md`. Die Fixture enthält bewusst keines
der B1b-Ausweichwörter, damit ein grünes Ergebnis die Ignore-Liste beweist und nicht
einen zufälligen Stichwort-Treffer.

```bash
tests/unit/lib/bats-core/bin/bats tests/unit/plan-lint.bats
# expected: FAIL — Test 22 liefert -366 statt leer, Test 23 sieht ein B1b-Finding.
```

## Task 2 — Ignore-Liste laden und in der Budget-Mathematik berücksichtigen

In `scripts/plan-lint.sh`:

- Neuer Loader `_load_s1_ignore` analog zu `_load_s1_limits`: liest
  `yq -r '.s1.ignore[]' docs/code-quality/gates.yaml` in ein Array `_S1_IGNORE`.
  Er folgt demselben Muster wie der bestehende Loader — einmaliges Laden über eine
  `_S1_IGNORE_LOADED`-Wächtervariable und ein abschließendes `return 0`, damit ein
  falsches letztes `[[ ]]` den Loader unter `set -e` nicht abbricht.
- Neue Funktion `_is_s1_ignored <path>`: liefert Exit 0, wenn der Pfad einem Eintrag
  entspricht. Der Vergleich nutzt Bashs Pattern-Matching (`[[ $path == $pattern ]]`),
  damit Verzeichnis-Muster die Dateien darunter erfassen; ein Eintrag ohne Glob-Zeichen
  wirkt weiterhin als exakter Pfadvergleich.
- `residual_budget` gibt am Anfang leer zurück, wenn `_is_s1_ignored` greift — vor dem
  `-f`-Test und vor jedem `wc -l`. Damit erben B1a und B1b das Verhalten, das sie für
  fehlende Dateien bereits haben, und ihre Prüflogik bleibt unverändert.
- Ist `yq` nicht verfügbar oder liefert die Abfrage nichts, bleibt `_S1_IGNORE` leer und
  das Verhalten entspricht exakt dem heutigen. Eine leere Liste darf nie dazu führen,
  dass echte Budget-Verstöße unbemerkt durchrutschen.

Der Selbsttest-Hook `PLAN_LINT_SELFTEST` erreicht `_is_s1_ignored` automatisch, da er
jede benannte Funktion aufruft; eine Registrierung ist nicht nötig.

```bash
tests/unit/lib/bats-core/bin/bats tests/unit/plan-lint.bats
# erwartet: PASS — beide T002270-Tests grün, die 21 bestehenden Tests unverändert grün.
```

## Task 3 — W4-Warnung für behauptete Budgets auf ignorierten Dateien

In `scripts/plan-lint.sh`, im B1a/B1b-Block: greift `_is_s1_ignored` für einen Pfad und
hat der Plan trotzdem eine Budget-**Zahl** behauptet (die bestehende
`claimed`-Erkennung), wird eine `W4`-Warnung gesetzt, die den Pfad nennt und erklärt,
dass das S1-Gate diese Datei nicht misst. Ohne behauptete Zahl bleibt der Lauf zu dieser
Datei stumm. Die Warnung verändert den Exit-Code nicht.

Neue Fixture `tests/unit/fixtures/plan-lint/s1-ignored-with-budget.md`: identisch zur
bestehenden Ignore-Fixture, aber mit einer Budget-Zahl in der dritten Spalte. Dazu ein
`@test`, der `W4` im Output erwartet und Exit 0 prüft, sowie eine Gegenprobe gegen die
bestehende Fixture ohne Zahl, die **kein** `W4` auslösen darf.

```bash
tests/unit/lib/bats-core/bin/bats tests/unit/plan-lint.bats
# erwartet: PASS
```

## Task 4 — Regressionsschutz für gemessene Dateien

Sicherstellen, dass die bestehende B1b-Warnung für **nicht** ignorierte Dateien
weiterhin feuert: `tests/unit/fixtures/plan-lint/over-threshold.md` referenziert
`k3d/talk-transcriber/app.py`, das nicht auf der Ignore-Liste steht. Der zugehörige
bestehende Test „B1b: file over its effective threshold without a split step warns"
muss unverändert grün bleiben — er ist die Gegenprobe dafür, dass Task 2 die Prüfung
nicht global abgeschaltet hat.

Zusätzlich `bash scripts/plan-lint.sh` gegen einen bereits gestageten Plan laufen lassen
und das Ergebnis mit dem Stand vor der Änderung vergleichen — für Dateien außerhalb der
Ignore-Liste darf sich nichts ändern.

## Task 5 — Abschließende Verifikation

```bash
tests/unit/lib/bats-core/bin/bats tests/unit/plan-lint.bats
task test:changed
task freshness:regenerate
task freshness:check
```

Dazu `task test:inventory` ausführen und `website/src/data/test-inventory.json`
mitcommitten, da diese Änderung neue `@test`-Blöcke hinzufügt.
