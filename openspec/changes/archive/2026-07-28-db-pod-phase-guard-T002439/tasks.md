---
title: "db-pod-phase-guard-T002439 — Implementation Plan"
ticket_id: T002439
domains: [testing, plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# db-pod-phase-guard-T002439 — Implementation Plan

_Ticket: T002439_

## File Structure

```
NEW:
  scripts/check-pod-phase-filter.sh                     — treffer-granularer Guard, Wurzeln scripts/ + tests/
  tests/spec/software-factory/db-pod-phase-guard.bats   — RED-Test (bereits im Branch, 10/10 rot)
CHANGED:
  tests/spec/software-factory.bats                      — 4 Selektionen filtern, _skip_if_no_db korrigieren,
                                                          inline-Guard T002386 auf das Skript umstellen
  scripts/vda/ticket/_ticket-core.sh                    — Opt-out-Marker auf die bewusst ungefilterte Zeile
  tests/spec/local-llm-proxy.bats                       — Phasenfilter
  tests/spec/database.bats                              — Phasenfilter
  tests/lib/factory-test-fixtures.sh                    — Phasenfilter
  tests/local/FA-SF-04-db-schema.bats                   — Phasenfilter
  tests/local/FA-SF-01-conflict-check.bats              — Phasenfilter
  tests/local/learning-db-schema.bats                   — Phasenfilter
  tests/local/FA-SF-26-watchdog.bats                    — Phasenfilter
  Taskfile.yml                                          — Task-Eintrag für den Guard (S4-Erreichbarkeit)
```

**S1-Budgets** (nur `.sh` unterliegt S1; `.bats` steht nicht in `gates.yaml → s1.limits`):

| Datei | Ist | Wirksame Schwelle | Budget |
|---|---|---|---|
| `scripts/check-pod-phase-filter.sh` | neu | 500 (Limit `.sh`, nicht gebaselined) | ~380 bei Zielgröße ≈ 120 Zeilen |
| `scripts/vda/ticket/_ticket-core.sh` | 143 | 500 (nicht gebaselined) | 357 — Änderung ist ein Kommentar-Suffix |
| `tests/lib/factory-test-fixtures.sh` | 63 | 500 (nicht gebaselined) | 437 |

Keine Datei liegt über 80 % ihrer wirksamen Schwelle; kein Split nötig.

## Tasks

### 1. RED-Zustand bestätigen

Der Test liegt bereits im Branch. Vor jeder Implementierung den roten Ausgangszustand belegen —
alle zehn Fälle müssen fehlschlagen, weil `scripts/check-pod-phase-filter.sh` noch nicht existiert.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory/db-pod-phase-guard.bats
# expected: FAIL — 10/10 rot; der Guard existiert noch nicht (Exit 127 pro Aufruf)
```

### 2. Guard-Skript `scripts/check-pod-phase-filter.sh` anlegen

Ein Bash-Skript, das jede `shared-db`-Pod-Selektion auf `--field-selector status.phase=Running`
prüft. Verhalten:

- **Argumente**: optionale Scan-Wurzeln. Ohne Argumente werden `scripts/` und `tests/` relativ
  zum Repo-Root gescannt. `--print-roots` gibt diese Standardwurzeln zeilenweise aus und beendet
  sich mit 0.
- **Dateiauswahl**: `*.sh` und `*.bats`.
- **Continuation-Join**: Zeilen, die auf einen Backslash enden, werden mit der Folgezeile zu einer
  logischen Zeile verbunden, bevor geprüft wird. Das deckt die umgebrochene Form in
  `scripts/vda/ticket/_ticket-core.sh` ab, ohne die restliche Datei mitzuentschuldigen.
- **Prüfung pro logischer Zeile**: enthält sie den Selektor auf die `shared-db`-App, muss sie
  entweder `--field-selector status.phase=Running` oder den Marker
  `# pod-phase-filter: intentional-unfiltered` tragen. Sonst ist sie ein Treffer.
- **Ausgabe**: pro Treffer eine Zeile mit Datei und Zeilennummer, damit die Fundstelle direkt
  anspringbar ist. Exit 1, wenn mindestens ein Treffer vorliegt, sonst 0.
- Ausführbar machen (`chmod +x`).

Die Treffer-Granularität ist der Kern: der bisherige Guard prüfte pro Datei und übersah dadurch
jede Datei, die den Filter-String an anderer Stelle führt.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory/db-pod-phase-guard.bats
# erwartet: Fälle 1–8 grün; Fall 9 (repo-weit) und Fall 10 (_skip_if_no_db) bleiben rot
```

### 3. Opt-out-Marker in `scripts/vda/ticket/_ticket-core.sh`

Die Zeile im Fehlerpfad von `_pgpod` fragt absichtlich ungefiltert nach, um „gar kein Pod" von
„Pods vorhanden, keiner Running" zu unterscheiden. Sie ist korrekt und bleibt inhaltlich
unverändert — sie bekommt nur den Marker `# pod-phase-filter: intentional-unfiltered`
angehängt. Der vorhandene Kommentar darüber erklärt bereits, warum die Abfrage ungefiltert ist;
der Marker macht daraus eine maschinenlesbare Ausnahme.

### 4. `tests/spec/software-factory.bats` korrigieren

Drei Änderungen in dieser Datei:

1. **Vier Selektionen filtern** (Zeilen 40, 165, 195, 871 im Ausgangsstand): jeweils
   `--field-selector status.phase=Running` ergänzen.
2. **`_skip_if_no_db` semantisch korrigieren**: der Helfer übersprang bisher nur, wenn gar kein
   Pod gefunden wurde. Mit dem Filter wird daraus „kein *Running* Pod erreichbar → skip". Die
   Skip-Meldung entsprechend anpassen, damit sie die tatsächliche Bedingung nennt. Das ist die
   Änderung, die AK 3 und AK 4 des Tickets schließt: ein Lauf gegen einen toten Pod endet im
   Skip statt in `rc=1`.
3. **Inline-Guard T002386 auf das Skript umstellen**: der `@test`-Block
   „every shared-db pod selection in scripts/ filters on phase Running" ruft künftig
   `scripts/check-pod-phase-filter.sh` auf, statt die Scan-Logik zu duplizieren. Zwei
   Implementierungen derselben Regel würden auseinanderlaufen. Der Testname wird angepasst, weil
   die Aussage nicht mehr auf `scripts/` beschränkt ist.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory.bats
# erwartet: unverändert grün, keine Regression in den bestehenden Fällen
```

### 5. Die sieben ungefilterten Dateien unter `tests/` filtern

In jeder Datei die `shared-db`-Selektion um `--field-selector status.phase=Running` ergänzen:
`tests/spec/local-llm-proxy.bats`, `tests/spec/database.bats`, `tests/lib/factory-test-fixtures.sh`,
`tests/local/FA-SF-04-db-schema.bats`, `tests/local/FA-SF-01-conflict-check.bats`,
`tests/local/learning-db-schema.bats`, `tests/local/FA-SF-26-watchdog.bats`.

Trägt eine dieser Dateien einen eigenen Skip-Helfer nach dem Muster von `_skip_if_no_db`, gilt
für ihn dieselbe semantische Korrektur wie in Task 4: Skip bei fehlendem *Running* Pod, nicht
erst bei fehlendem Pod-Objekt.

```bash
bash scripts/check-pod-phase-filter.sh
# erwartet: Exit 0 — keine ungefilterte Selektion mehr im Repo
```

### 6. S4-Erreichbarkeit herstellen

`scripts/check-pod-phase-filter.sh` ist ein neues Skript und muss von Taskfile, CI, Doku oder
einem anderen Skript aus erreichbar sein, sonst meldet S4 eine Orphan-Violation. Der Aufruf aus
`tests/spec/software-factory.bats` (Task 4) stellt die Erreichbarkeit bereits her; zusätzlich
einen Taskfile-Eintrag ergänzen, damit der Guard auch manuell ohne BATS läuft.

```bash
node scripts/code-quality/check.mjs
# erwartet: keine S4-Orphan-Violation für scripts/check-pod-phase-filter.sh
```

### 7. Tests & CI-Gates

Alle zehn Fälle des RED-Tests müssen jetzt grün sein, insbesondere Fall 9 (repo-weit sauber) und
Fall 10 (`_skip_if_no_db` filtert auf Running).

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory/db-pod-phase-guard.bats
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory.bats
task test:changed
task freshness:regenerate
task freshness:check
```
