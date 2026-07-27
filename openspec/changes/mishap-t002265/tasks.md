---
title: "mishap-t002265 — Implementation Plan"
ticket_id: T002265
domains: [infra, test]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# mishap-t002265 — Implementation Plan

_Ticket: T002265 — Mishap-Bundle aus der Session vom 2026-07-27 (zwei Befunde)._

Beide Befunde betreffen Werkzeuge, die einen Agenten in die Irre führen: eine
Kennzahl, die „nicht anwendbar" als drastische Grenzüberschreitung ausgibt, und
ein Testrunner, dessen naheliegender Pfad nicht existiert.

## File Structure

| Datei | Rolle in diesem Plan |
|---|---|
| `scripts/plan-lint.sh` | Befund 1: `residual_budget` liefert für nicht gegatete Extensions kein rechnerisches Negativ mehr |
| `CLAUDE.md` | Befund 2: Pfad des vendored BATS-Runners in der BATS-Konventions-Sektion nennen |
| `tests/unit/plan-lint.bats` | Guard für Befund 1 (bestehende Suite zur Budget-Mathematik) |
| `tests/unit/bats-runner-path.bats` | Guard für Befund 2 (neu, nicht ticketnummeriert — siehe BATS-Konvention) |

## Task 1 — RED: Guards schreiben, die auf dem aktuellen Stand fehlschlagen

1. In `tests/unit/plan-lint.bats`: ein `@test`, der
   `PLAN_LINT_SELFTEST=1 bash scripts/plan-lint.sh residual_budget <pfad>` für eine
   existierende Datei mit **nicht gegateter** Extension aufruft (zum Beispiel eine
   `.bats`- oder `.ps1`-Datei aus dem Repo) und verlangt, dass die Ausgabe **kein**
   negativer Zahlenwert ist. Die Suite testet die Budget-Mathematik bereits über
   denselben Selbsttest-Hook, das Muster ist also vorhanden.
2. Neue Datei `tests/unit/bats-runner-path.bats`: ein `@test`, der prüft, dass
   `CLAUDE.md` den Pfad `tests/unit/lib/bats-core/bin/bats` nennt, und ein
   zweiter, der bestätigt, dass dieser Pfad im Repo existiert und ausführbar ist.

Beide laufen lassen — sie müssen rot sein:

```bash
tests/unit/lib/bats-core/bin/bats tests/unit/plan-lint.bats
tests/unit/lib/bats-core/bin/bats tests/unit/bats-runner-path.bats
# expected: FAIL — beide Guards sind rot, die Fixes fehlen noch
```

## Task 2 — Befund 1: `residual_budget` gibt „nicht anwendbar" als grosse negative Zahl aus

`residual_budget()` in `scripts/plan-lint.sh` rechnet
`effective_threshold(path) − wc -l`. `effective_threshold` ruft `_ext_limit`, und
das liefert `${_S1_LIMITS[$ext]:-0}` — für unbekannte Extensions also **0**. Ohne
Baseline-Eintrag ist der Threshold damit 0 und das Ergebnis genau die negative
Zeilenzahl der Datei.

Gemessen am 2026-07-27 bei T002260 für vier Dateien: `-116`, `-82`, `-79`, `-214`
— jeweils exakt die negative Zeilenzahl. `.ps1` und `.bats` stehen nicht in
`_S1_LIMITS`, und in `docs/code-quality/baseline.json` existierte für keine der
vier Dateien ein Eintrag. `task freshness:check` war trotz aller vier Werte grün.

Das ist gefährlich, weil `verification-block.md` vorschreibt: „Bei Restbudget ≤ 0:
Datei **echt verkleinern**". Ein Agent, der das befolgt, kürzt hier Dateien, für
die das S1-Gate gar nicht gilt — und kürzt bevorzugt die erklärenden Kommentare,
also genau die Substanz.

Der Kommentar an `effective_threshold` sagt bereits „0 if ungated & unbaselined";
die 0 ist als *Threshold* also gewollt. Nur die Weiterverarbeitung in
`residual_budget` macht daraus eine irreführende Differenz.

Fix: in `residual_budget` den Fall „Threshold 0 und kein Baseline-Eintrag" von der
Subtraktion ausnehmen und stattdessen dasselbe signalisieren wie der bereits
vorhandene Fall „Datei existiert nicht", nämlich eine leere Ausgabe. Der Aufrufer
in der B1a-Prüfung verwendet den Wert über `computed="$(residual_budget "$path")"`
und muss mit der leeren Ausgabe unverändert weiterarbeiten — das ist die
Bedingung, die der Fix einhalten muss. Wer stattdessen einen sprechenden Marker
wie `n/a` bevorzugt, muss diesen Aufrufer mit anpassen.

## Task 3 — Befund 2: Pfad des vendored BATS-Runners ist nicht dokumentiert

Um eine einzelne Spec auszuführen, ist der naheliegende Versuch
`./tests/bats/bin/bats tests/spec/<datei>.bats` — dieser Pfad existiert nicht.
Der tatsächliche vendored Runner liegt unter
`tests/unit/lib/bats-core/bin/bats` und war nur über
`grep -nE 'bats' Taskfile.yml` zu finden.

Verschärfend: `which bats` liefert eine **global installierte** npm-Variante
(`~/.npm-global/bin/bats`), die nicht die vendored Version ist. Ein Agent könnte
also unbemerkt mit einer anderen BATS-Version testen als CI. Seit T002135 ist
bats vendored (keine Submodule mehr), der Pfad hat sich gegenüber älteren Notizen
verschoben.

Fix: den Runner-Pfad in der BATS-Konventions-Sektion von `CLAUDE.md` nennen —
dort steht die Konvention zu `tests/spec/<spec-slug>.bats` bereits, nur ohne
Angabe, womit man diese Dateien ausführt. Ein Satz mit dem vollständigen Pfad und
der Warnung, dass ein global installiertes `bats` eine andere Version sein kann.

## Task 4 — GREEN: Guards müssen jetzt bestehen

```bash
tests/unit/lib/bats-core/bin/bats tests/unit/plan-lint.bats
tests/unit/lib/bats-core/bin/bats tests/unit/bats-runner-path.bats
```

Zusätzlich gegenprüfen, dass die Guards nicht trivial grün sind: die jeweilige
Änderung kurz zurückdrehen, den Test rot sehen, wieder herstellen. Für Befund 1
zusätzlich sicherstellen, dass die B1a-Budget-Prüfung weiterhin funktioniert —
ein Plan, der für eine gegatete `.ts`-Datei einen falschen Budget-Wert behauptet,
muss unverändert hart fehlschlagen.

## Task 5 — Final Verification

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
