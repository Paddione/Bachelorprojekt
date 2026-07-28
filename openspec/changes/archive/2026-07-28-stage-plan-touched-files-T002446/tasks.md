---
title: "stage-plan-touched-files-T002446 — Implementation Plan"
ticket_id: T002446
domains: [testing, plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# stage-plan-touched-files-T002446 — Implementation Plan

_Ticket: T002446_

## File Structure

```
NEW:
  scripts/plan-touched-files.sh                              — Ableiter: Planpfad rein, Dateiliste raus
  tests/spec/software-factory/stage-plan-touched-files.bats  — RED-Test (bereits im Branch, 8/8 rot)
CHANGED:
  scripts/vda/ticket/stage-plan.sh                           — ruft den Ableiter auf, schreibt additiv
  .claude/skills/references/dev-flow-execute-phases.md       — Schritt 1.5 beschreibt Ergaenzen statt Erstschreiben
  Taskfile.yml                                               — Task-Eintrag fuer den Ableiter (S4-Erreichbarkeit)
```

**S1-Budgets** (nur `.sh` unterliegt S1; `.bats` und `.md` stehen nicht in `gates.yaml → s1.limits`):

| Datei | Ist | Wirksame Schwelle | Budget |
|---|---|---|---|
| `scripts/plan-touched-files.sh` | neu | 500 (Limit `.sh`, nicht gebaselined) | ~420 bei Zielgröße ≈ 80 Zeilen |
| `scripts/vda/ticket/stage-plan.sh` | 115 | 500 (nicht gebaselined) | 385 |

Keine Datei liegt über 80 % ihrer wirksamen Schwelle; kein Split nötig.

## Tasks

### 1. RED-Zustand bestätigen

Der Test liegt bereits im Branch. Vor jeder Implementierung den roten Ausgangszustand belegen —
alle acht Fälle müssen fehlschlagen, weil `scripts/plan-touched-files.sh` noch nicht existiert
und `stage-plan.sh` den Ableiter nicht kennt.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory/stage-plan-touched-files.bats
# expected: FAIL — 8/8 rot
```

### 2. Ableiter `scripts/plan-touched-files.sh` anlegen

Nimmt genau ein Argument, den Planpfad, und schreibt die abgeleiteten Repo-Pfade zeilenweise auf
stdout. Zwei Stufen:

**Kandidaten sammeln.** Die Sektionsgrenze ist derselbe awk-Ausdruck, den `plan-lint.sh:341`
benutzt: ab `## File Structure` bis zum nächsten H2, damit H3-Untergliederungen
(`### New files`) Teil der Sektion bleiben. Innerhalb der Sektion greifen zwei Muster —
Backtick-Spans (deckt Bullet- und Tabellenform) und im Code-Fence das erste Token einer Zeile vor
dem Gedankenstrich. Gruppenköpfe wie `NEW:` und `CHANGED:` sind keine Kandidaten.

**Filtern.** Ein Kandidat wird ausgegeben, wenn er in `git ls-files` steht **oder** eine bekannte
Datei-Extension trägt. Neue Dateien sind noch nicht getrackt, tragen aber eine Extension;
`deployment/arena-server` hat weder das eine noch das andere und fällt heraus. Duplikate werden
entfernt, die Ausgabe ist stabil sortiert, damit `touched_files` reproduzierbar bleibt.

Liefert der Filter nichts, geht eine Meldung auf stderr und stdout bleibt leer; der Exit-Code ist
0. Ausführbar machen (`chmod +x`).

Der awk-Ausdruck wird bewusst kopiert statt aus `plan-lint.sh` importiert: das ist ein
fail-closed CI-Gate ohne Bibliotheks-Charakter, und eine geteilte Funktion würde `stage-plan` an
dessen Lebenszyklus koppeln.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory/stage-plan-touched-files.bats
# erwartet: Fälle 1–6 grün; Fälle 7 und 8 (Verdrahtung in stage-plan) bleiben rot
```

### 3. `stage-plan.sh` verdrahten — additiv, nicht ersetzend

Nach dem bestehenden Status-Update einen weiteren `_exec_sql`-Block ergänzen, der die abgeleitete
Liste nach `touched_files` schreibt. Die Plan-Datei ist an dieser Stelle schon aufgelöst: der
Preflight (Zeilen 36–42) prüft sie über `git cat-file -e` gegen Branch, `HEAD` und Disk —
derselbe Auflösungspfad liefert den Inhalt für den Ableiter.

Die Zusammenführung passiert **in SQL**, damit sie atomar bleibt: der neue Wert ist die
duplikatfreie Vereinigung aus vorhandenem Wert und abgeleiteter Liste, nicht deren Ersetzung.
Ein `UPDATE … SET touched_files = <plan>` würde alles verwerfen, was der Implementer während der
Umsetzung über `dev-flow-execute` Schritt 1.5 ergänzt hat — und damit bei jedem erneuten
`stage-plan` Information vernichten.

Liefert der Ableiter eine leere Liste, bleibt `touched_files` unverändert und `stage-plan` läuft
normal weiter.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory/stage-plan-touched-files.bats
# erwartet: 8/8 grün
```

### 4. Ende-zu-Ende gegen die Datenbank prüfen

Der bisherige Nachweis ist statisch (Skript-Inhalt gegrept). Einmal real prüfen: ein Ticket mit
gestagtem Plan hat unmittelbar danach `touched_files` gesetzt, und ein zweiter `stage-plan`-Lauf
verwirft einen zuvor manuell ergänzten Pfad nicht.

```bash
bash scripts/ticket.sh set-touched-files --id <test-ticket> --files "scripts/extra.sh"
bash scripts/ticket.sh stage-plan --id <test-ticket> --branch <branch> --plan <plan> --partials 1 --hold
bash scripts/ticket.sh get --id <test-ticket>
# erwartet: touched_files enthält scripts/extra.sh UND die Pfade aus dem Plan
```

### 5. Schritt 1.5 der Execute-Phase umformulieren

`.claude/skills/references/dev-flow-execute-phases.md:228` beschreibt heute ein konditionales
Erstschreiben („Falls der Plan die berührten Dateien kennt"). Nach dieser Änderung ist die
Baseline beim Stagen bereits gesetzt; der Schritt ergänzt nur noch, was während der Umsetzung
dazukam. Die Formulierung entsprechend anpassen, damit die Anleitung nicht länger etwas als
optional beschreibt, das inzwischen automatisch passiert.

### 6. S4-Erreichbarkeit herstellen

`scripts/plan-touched-files.sh` ist ein neues Skript und muss von Taskfile, CI, Doku oder einem
anderen Skript aus erreichbar sein, sonst meldet S4 eine Orphan-Violation. Der Aufruf aus
`stage-plan.sh` (Task 3) stellt die Erreichbarkeit her; zusätzlich einen Taskfile-Eintrag
ergänzen, damit die Ableitung für einen Plan auch manuell nachvollziehbar ist.

```bash
node scripts/code-quality/check.mjs
# erwartet: keine S4-Orphan-Violation für scripts/plan-touched-files.sh
```

### 7. Tests & CI-Gates

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory/stage-plan-touched-files.bats
task test:changed
task freshness:regenerate
task freshness:check
```
