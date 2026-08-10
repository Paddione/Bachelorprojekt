---
title: "unsloth-eval-harness — Implementation Plan"
ticket_id: T002606
domains: [scripts, llm, tests]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# unsloth-eval-harness — Implementation Plan

_Ticket: T002606_

## File Structure

| Datei | Art | Rolle |
|---|---|---|
| `scripts/finetune/eval_harness.py` | neu | Paarweiser Lauf Base gegen Tuned, Aggregation, Gate-Exit |
| `scripts/finetune/eval_scoring.py` | neu | Bewertungsregeln je Fallklasse, ohne Modellzugriff testbar |
| `scripts/finetune/testsets/README.md` | neu | Format, Herkunftspflicht, Erweiterungsweg |
| `scripts/finetune/testsets/agent-actions.jsonl` | neu | Testset, mindestens 40 Fälle, beide Sprachen |
| `Taskfile.finetune-eval.yml` | neu | `finetune-eval:`-Namespace |
| `Taskfile.yml` | geändert | Include-Eintrag für den Namespace |
| `tests/spec/unsloth-eval-harness/scoring-rules.bats` | neu | Guards für die Bewertungsregeln |
| `tests/spec/unsloth-eval-harness/testset-shape.bats` | neu | Guards für Umfang, Partitionen, Sprachpaarung |
| `tests/spec/unsloth-eval-harness/regression-gate.bats` | neu | Guards für den Exit-Code des Gates |

**Zeilenbudgets.** Beide neuen Python-Dateien werden unter dem `.py`-Limit aus
`docs/code-quality/gates.yaml` geschnitten; keine ist gebaselined. Die Trennung in
`eval_harness.py` (Modellzugriff, Orchestrierung) und `eval_scoring.py` (reine Bewertungslogik) ist
kein kosmetischer Split, sondern Voraussetzung dafür, dass die Bewertungsregeln ohne GPU und ohne
Modellgewichte getestet werden können. `Taskfile.yml` ist YAML und unterliegt dem S1-Zeilengate
nicht.

**Partial-Manifest** — disjunkte `target_files`, Tests zuletzt:

| Partial | Rolle | target_files |
|---|---|---|
| p1 | Bewertungsregeln | `scripts/finetune/eval_scoring.py` |
| p2 | Testset | `scripts/finetune/testsets/agent-actions.jsonl`, `scripts/finetune/testsets/README.md` |
| p3 | Harness und Gate | `scripts/finetune/eval_harness.py` |
| p4 | Integration | `Taskfile.finetune-eval.yml`, `Taskfile.yml` |
| p5 | Tests | `tests/spec/unsloth-eval-harness/` |

Der Namespace bekommt eine **eigene** Taskfile-Datei statt eines Anhangs an die Datei aus T002587.
Beide Changes laufen auf getrennten Branches; ein gemeinsames Dateiende wäre eine planbare
Merge-Kollision.

---

## Task 1 (p1) — Bewertungsregeln, ohne Modell prüfbar

`scripts/finetune/eval_scoring.py` enthält die gesamte Bewertungslogik als reine Funktionen über
Zeichenketten. Kein Modellzugriff, keine GPU — dadurch sind die Regeln in CI prüfbar, wo weder das
eine noch das andere zur Verfügung steht.

Drei Fallklassen, jede mit eigener Regel:

- **`action`** — eine bestimmte Aktion ist korrekt. Bewertet werden: syntaktische Wohlgeformtheit
  der Aktionsausgabe, Übereinstimmung des Aktionsnamens mit dem erwarteten, Vollständigkeit der
  Pflichtparameter und Abwesenheit unbekannter Parameter.
- **`no_action`** — keine Aktion ist korrekt. Volle Punktzahl nur, wenn gar keine Aktionsausgabe
  erzeugt wurde. Eine erzeugte Aktion ist hier kein Teilerfolg, sondern der Fehlerfall, den zu
  messen der eigentliche Zweck ist.
- **`clarify`** — die Angaben sind unvollständig, eine Rückfrage ist korrekt. Volle Punktzahl nur
  ohne Aktionsausgabe. Eine Aktion mit erfundenen Parametern zählt null.

Bei mehreren erwarteten Aktionen in einem Fall wird die Menge der ausgegebenen Aktionsnamen gegen
die erwartete Menge geprüft, nicht nur die erste Ausgabe. Genau hier lag im Vorversuch der
Unterschied zwischen Basismodell und Adapter.

## Task 2 (p2) — Testset als Daten

`scripts/finetune/testsets/agent-actions.jsonl` enthält mindestens 40 Fälle. Je Zeile: Kennung,
Fallklasse, verfügbare Aktionsschemata, Anfrage, erwartete Aktionen, Sprache und Herkunftsvermerk.

Verbindliche Eigenschaften:

- **Drei Partitionen** mit jeweils substanziellem Anteil. Ein Testset ohne `no_action`- und
  `clarify`-Fälle kann die gefährlichste Regressionsrichtung nicht sehen.
- **Jeder Fall in beiden Sprachen** — der Sprache des Trainingskorpus und der Zielsprache. Der
  Herkunftsvermerk hält fest, dass der Fall nicht aus einem Trainingskorpus stammt.
- **Aktionsschemata aus der eigenen Domäne**, nicht aus dem Trainingskorpus. Damit misst der
  Harness Generalisierung statt Wiedererkennung.
- Keine Marken-Domainliterale in den Fällen; Hostnamen werden über Platzhalter geführt.

`scripts/finetune/testsets/README.md` beschreibt das Format und wie ein Fall hinzukommt. Der
Zusatz eines Falls darf keine Codeänderung erfordern — das ist die Bedingung dafür, dass der
Umfang über die geforderten 40 hinaus wachsen kann.

## Task 3 (p3) — Harness und Regressions-Gate

`scripts/finetune/eval_harness.py` lädt nacheinander Basismodell und adaptiertes Modell, generiert
zu jedem Testfall mit identischen Decoding-Parametern (greedy) und identischem Prompt-Pfad, und
bewertet über die Regeln aus Task 1.

- **Nacheinander, nicht gleichzeitig.** Beide Modelle zusammen im Speicher zu halten ist auf der
  Zielhardware nicht möglich; zwischen den Läufen wird der Speicher freigegeben.
- **Basismodell-Kennung** wird aus der Adapter-Konfiguration gelesen. Fehlt sie, endet der Lauf mit
  Exit ungleich null und ohne Teilurteil — ein Vergleich gegen ein geratenes Basismodell wäre
  wertlos.
- **Ausgabe** als JSON: je Fall beide Punktzahlen, dazu Aggregate je Partition und je Sprache.
- **Gate:** liegt das Aggregat des Adapters unter dem des Basismodells, Exit ungleich null mit
  Nennung der betroffenen Partitionen. Liegt es gleichauf oder darüber, Exit null.
- Ein Testset unter 40 Fällen führt zum Abbruch mit Nennung des Fehlbetrags.

## Task 4 (p4) — Anbindung

`Taskfile.finetune-eval.yml` stellt den Namespace `finetune-eval:` mit `run` (voller Lauf gegen
einen Adapter) und `gate` (nur Exit-Code, für die Verwendung in Abnahmeschritten). Eingehängt als
eigener Include in `Taskfile.yml` nach dem Muster der bestehenden Namespaces.

## Task 5 (p5) — Tests

Prüfmodus: **Output-Verifikation**. Die Tests rufen die Kommandos auf und prüfen Ausgabe und
Exit-Code. Sie laufen ohne GPU und ohne Modellgewichte, weil die Bewertungsregeln aus Task 1 rein
und die Modellausgaben in den Fixtures vorgegeben sind.

**Failing-Test-Step (rot vor grün)** — vor der Implementierung von Task 1 ausführen:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/unsloth-eval-harness/scoring-rules.bats
# expected: FAIL — scripts/finetune/eval_scoring.py existiert noch nicht,
# der Aufruf endet mit Exit ungleich null und ohne Bewertungsausgabe.
```

Danach dieselbe Zeile erneut, bis sie grün ist.

Abzudeckende Aussagen, jede mit Positiv-Anker **vor** der Negativ-Aussage:

- `scoring-rules.bats` — eine wohlgeformte, korrekte Aktion erreicht die volle Punktzahl; eine
  Aktion mit fehlendem Pflichtparameter erreicht sie nicht. Für `no_action` erreicht eine Antwort
  ohne Aktionsausgabe die volle Punktzahl, eine mit Aktionsausgabe null. Für `clarify` ebenso.
  Bei zwei erwarteten Aktionen erreicht nur die vollständige Menge die volle Punktzahl.
- `testset-shape.bats` — das mitgelieferte Testset hat mindestens 40 Fälle, alle drei Partitionen
  sind besetzt, und zu jedem Fall existiert das Gegenstück in der zweiten Sprache. Ein künstlich
  gekürztes Testset führt zu Exit ungleich null.
- `regression-gate.bats` — bei gleichem Ergebnis für Base und Tuned endet der Harness mit Exit
  null; bei einer künstlich verschlechterten Tuned-Ausgabe mit Exit ungleich null, und die Meldung
  nennt die betroffene Partition.

Nach Anlegen der Testdateien `task test:inventory` ausführen und
`website/src/data/test-inventory.json` mitcommitten.

## Task 6 — Verifikation

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

Zusätzlich:

```bash
bash scripts/plan-lint.sh openspec/changes/unsloth-eval-harness/tasks.md
tests/unit/lib/bats-core/bin/bats -r tests/spec/unsloth-eval-harness/
```

Der Harness ist damit unabhängig von T002587 lauffähig. Sobald beide Changes gemerged sind, ist
`finetune-eval:gate` der Abnahmeschritt für jeden Trainingslauf: ein Adapter, der ihn nicht
besteht, wird nicht exportiert und nicht als Factory-Slot ausgeliefert.
