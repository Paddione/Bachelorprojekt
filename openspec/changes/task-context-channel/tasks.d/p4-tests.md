---
title: "p4 — BATS-Abdeckung für Generator, Assembler und Gate"
ticket_id: T002420
domains: [test]
status: plan_staged
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# p4 — BATS-Abdeckung

**Zieldatei:** `tests/spec/dev-flow-plan/task-context.bats` (neu)

Eigene Datei im Spec-Verzeichnis, **nicht** angehängt an die Sammeldatei
`tests/spec/dev-flow-plan.bats` (T002416, CLAUDE.md). Dieses Vorhaben ist der Anlassfall: vier
Partials, deren Test-Partial sonst am Dateiende mit jeder Parallelarbeit kollidiert. Der Runner
läuft seit T002416 mit `bats -r tests/spec/` und erfasst beide Formen.

## Task 1: Failing-Test-Step (RED)

Die Testdatei wird **zuerst** angelegt und ausgeführt, bevor p1 bis p3 implementiert sind:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/dev-flow-plan/task-context.bats
# expected: FAIL — scripts/plan-intel.sh und scripts/task-context.sh existieren noch nicht
```

Syntaxprüfung der Datei erfolgt mit `tests/unit/lib/bats-core/bin/bats --count <datei>`, nicht mit
`bash -n`: `@test "name" { … }` ist keine gültige Bash-Syntax und `bash -n` meldet einen
irreführenden Fehler (T002351-M2).

## Task 2: Generator-Tests (p1)

- Erzeugt aus einem Fixture-Slug ein schema-konformes Bundle; `impact_files` enthält je Zieldatei
  `loc` und `s1_budget`.
- Eine Datei auf der `s1.ignore`-Liste bekommt `s1_budget: null`, **nicht** 0. Positiv-Anker im
  selben Test: eine gemessene Datei liefert im selben Lauf einen numerischen Wert — sonst wäre die
  Aussage „nicht 0" auch bei einem Generator wahr, der gar nichts schreibt.
- Nicht erreichbare Quelle erzeugt einen `risks[]`-Eintrag mit `severity: warn`, der die Quelle
  benennt.
- Vorhandene `api_contracts` in einer bestehenden Zieldatei überleben einen erneuten Lauf.

## Task 3: Assembler-Tests (p2)

- **Kern hart:** fehlendes `intel.json` führt zu Exit ungleich 0 und **keiner** Ausgabe des
  Kontextblocks auf stdout.
- **Ergänzung weich:** ein nicht erreichbares Signal (per Fixture erzwungen) lässt den Assembler
  mit 0 enden, der Kern erscheint, und die Ausgabe enthält den `WARN:`-Marker mit dem Namen des
  Signals. Positiv-Anker im selben Test: bei erreichbarem Signal erscheint die Sektion mit Inhalt
  und **ohne** Marker — sonst besteht der Test auch gegen einen Assembler, der immer nur warnt.
- **Latenzgrenze:** bei drei unerreichbaren Signalen bleibt die Gesamtlaufzeit unter der
  dokumentierten oberen Schranke.
- **Partial-Zuschnitt:** `--partial p3` liefert genau die `impact_files` dieses Partials.

## Task 4: Gate-Tests (p3)

- Ein Plan mit vollständigem Bundle passiert `plan-lint.sh` (Positiv-Anker, muss **zuerst**
  laufen).
- Ein Plan, dessen Manifest eine in `impact_files` fehlende Zieldatei nennt, führt zu Exit ungleich
  0, und die Meldung enthält den Namen der fehlenden Datei.
- Ein Plan ohne `tasks.d/` wird von I1 nicht berührt (Einzelplan-Modus bleibt unverändert).

## Task 5: Konsistenz beider Konsumenten

Für denselben Slug liefern der Factory-Aufruf und der `dev-flow-execute`-Aufruf denselben
statischen Kern. Verglichen wird der Kern-Teil der Ausgabe, nicht der Block als Ganzes — die
frischen Signale dürfen abweichen, weil sie zu unterschiedlichen Zeitpunkten erhoben werden.

## Task 6: Assertion-Hygiene

Kein unqualifiziertes `[[ "$output" == *"<term>"* ]]` gegen das volle stdout+stderr. Beide
Skripte geben in ihrer Usage `$0` aus; das Worktree-Verzeichnis leitet sich vom Change-Slug ab und
kann den Treffer erzeugen, obwohl die geprüfte Funktion fehlt. Assertions werden zuerst auf die
relevante Ausgabezeile eingegrenzt (CLAUDE.md, BATS-`$output`-Konvention).

Jeder Negativtest trägt seinen Positiv-Anker im selben `@test`, in dieser Reihenfolge: erst
prüfen, dass der gültige Fall durchläuft, dann die Negativ-Aussage (T002356-M1). Ohne den Anker
besteht ein Negativtest vakuos gegen eine leere Kandidatenliste.

## Task 7: Inventar

```bash
task test:inventory
```

`website/src/data/test-inventory.json` mitcommitten — der CI-Inventar-Check vergleicht gegen die
committete Fassung und failt sonst.
