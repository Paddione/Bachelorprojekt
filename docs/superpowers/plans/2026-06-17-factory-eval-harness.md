---
title: Plan — T000930: SWE-bench-artige Eval-Harness für die Software Factory
ticket_id: T000930
domains: [factory, test]
status: active
pr_number: null
file_locks: [Taskfile.yml, scripts/factory/eval.mjs]
shared_changes: false
batch_id: batch-2026-06-17-planning
parent_feature: null
depends_on_plans: []
---

# Plan — T000930: SWE-bench-artige Eval-Harness für die Software Factory

**Ticket:** T000930
**Spec:** docs/superpowers/specs/2026-06-17-factory-eval-harness-design.md
**Branch:** feature/peer-inspired-specs
**Domains:** factory, test

## Ziel

Aufbau einer automatisierten, reproduzierbaren Test- und Validierungs-Harness (`task factory:eval`), die den Factory-Agenten-Output (DeepSeek Scout + Build) auf bekannten Golden-Fixtures (historische Tickets) bewertet, scored und Trends über Zeit abbildet.

## Architektur

- **Golden-Fixture-Set:** Abgelegt unter `tests/factory-eval/fixtures/<id>/`. Jede Fixture enthält:
  - `ticket.json`: Die synthetische Ticket-Definition (Titel, Beschreibung).
  - `expected.json`: Die Soll-Erwartung (erwartete Dateipfade, verbotene Pfade, Tests).
  - `setup.sh` (optional): Stellt Pre-State-Bedingungen her.
- **Runner (`scripts/factory/eval.mjs`):** Schleife über alle Fixtures, die:
  1. Einen isolierten Worktree via `scripts/worktree-create.sh` erstellt.
  2. Die Factory in der dry-run-Pipeline aufruft.
  3. Den erzeugten git diff und die Testergebnisse parsed und bewertet.
  4. Den Worktree aufräumt.
  5. Eine Scorecard `scorecard-<ts>.json` und `latest.json` schreibt.
- **Scoring:** Deterministisches Multi-Dimensionen-Scoring (Lokalisierung Recall/Precision, verbotene Pfade, Testerfolg).

## Tech-Stack

Node.js (`.mjs`, `child_process`, `fs`), Bash, K3d/kubectl (dry-run).

## S1-Zeilenbudget (verbindlich vor Implementierung ermittelt)

| Datei | Ist | Baseline | wirksame Schwelle | Budget | Konsequenz |
|---|---|---|---|---|---|
| `scripts/factory/eval.mjs` | neu | — | 500 (`.mjs`) | Ziel < 300 | Schlanker CLI Runner, delegiert komplexe Diff-Operationen. |
| `tests/factory-eval/fixtures/` | neu | — | (Konfig) | n/a | Ordner für Golden-Fixtures. |

## S3 / S4 Hinweise

- **S3:** Keine Hardcodierten Hostnamen in den Fixtures oder Logs.
- **S4:** `scripts/factory/eval.mjs` wird in `Taskfile.yml` über den Task `factory:eval` aufgerufen. Scorecards werden unter `docs/factory-eval/` abgelegt.

## Tasks

### Task 1 — Golden-Fixtures scaffolden
- [ ] Ordner `tests/factory-eval/fixtures/` erstellen.
- [ ] Drei Test-Fixtures basierend auf bereits gelösten Tickets erstellen (z. B. `T000725`, `T000726`, `T000925`):
  - `tests/factory-eval/fixtures/<id>/ticket.json` (Ticket-Daten).
  - `tests/factory-eval/fixtures/<id>/expected.json` mit:
    ```json
    {
      "files": ["docs/superpowers/plans/*", "scripts/factory/*"],
      "forbidden": ["k3d/configmap-domains.yaml"],
      "tests": ["task test:changed"]
    }
    ```
- **Acceptance:** Fixture-Dateien existieren und sind valide strukturiert.

### Task 2 — Runner & Scoring implementieren (`scripts/factory/eval.mjs`)
- [ ] `scripts/factory/eval.mjs` schreiben.
  - Sequenzieller Durchlauf der Fixtures.
  - Nutzt `scripts/worktree-create.sh` zur Workspace-Isolierung.
  - Führt die Factory mit `DRY_RUN=true` aus.
  - Implementiert Scoring-Berechnung:
    - *Lokalisierung:* Dateipfad-Matches.
    - *Scope-Disziplin:* Prüft verbotene Dateien.
    - *Test-Erfolg:* Führt angegebene Tests aus.
  - Erstellt `docs/factory-eval/scorecard-<ts>.json` und `docs/factory-eval/latest.json`.
- [ ] Task `factory:eval` im `Taskfile.yml` eintragen.
- **Acceptance:** Running `task factory:eval` erzeugt eine Scorecard-Datei.

### Task 3 — Diskriminierungs-Verifikation
- [ ] Einen bewussten Regress einbauen (z. B. die Prompt-Instruktionen der Scout-Phase verzerren) und `task factory:eval` laufen lassen.
- **Acceptance:** Der Score sinkt reproduzierbar gegenüber der Baseline, was beweist, dass die Harness fehlerhaften Code oder falsche Zuweisungen korrekt erkennt.

### Task 4 — Unit-Tests & CI-Wiring
- [ ] Unit-Tests für die Scoring-Logik in `tests/local/FA-SF-58-eval-harness.bats` schreiben (vollständig offline-safe, mockt Factory-Diffeingabe).
- **Acceptance:** `task test:factory` läuft erfolgreich.

### Task 5 — Finale Verifikation (Pflicht-Gate)
- [ ] `task test:changed`
- [ ] `task freshness:regenerate`
- [ ] `task freshness:check`
- **Acceptance:** Alle Prüfungen grün.

## Verifikation (zusammengefasst)

```bash
task factory:eval
task test:changed
task freshness:regenerate
task freshness:check
```
