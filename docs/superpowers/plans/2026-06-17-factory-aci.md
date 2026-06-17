---
title: Plan — T000931: Agent-Computer-Interface (ACI) mit lokalisiertem Edit/Repair-Loop
ticket_id: T000931
domains: [factory]
status: active
pr_number: null
file_locks: [scripts/factory/pipeline.js, scripts/factory/aci.cjs]
shared_changes: false
batch_id: batch-2026-06-17-planning
parent_feature: null
depends_on_plans: [docs/superpowers/plans/2026-06-17-factory-eval-harness.md]
---

# Plan — T000931: Agent-Computer-Interface (ACI) mit lokalisiertem Edit/Repair-Loop

**Ticket:** T000931
**Spec:** docs/superpowers/specs/2026-06-17-factory-aci-design.md
**Branch:** feature/peer-inspired-specs
**Domains:** factory

## Ziel

Implementierung einer ACI-Schicht (Agent-Computer-Interface) in der Software Factory Build-Phase, um die Editierpräzision von DeepSeek zu verbessern. Dies umfasst ein restriktives Tool-Set (`aci_view`, `aci_search`, `aci_edit`, `aci_test`), automatischen Syntax- und Lintcheck vor dem Behalten eines Edits (mit automatischem Rollback bei Fehlern) und einen Self-Repair-Loop.

## Architektur

- **ACI-Tools (`scripts/factory/aci.cjs`):**
  - `view(file, start, end)`: Zeigt zeilennummerierten Ausschnitt.
  - `search(pattern, glob)`: Findet Suchbegriffe im Scope.
  - `edit(file, start, end, replacement)`: Ersetzt Bereich, validiert Syntax, revertiert bei Fehler und liefert die Fehlerbeobachtung zurück.
  - `test(file)`: Führt gezielte unit/changed tests aus.
- **Edit-Validierung:** Führt typspezifische Syntaxchecks aus (z. B. `tsc --noEmit` für TypeScript/JS, `bash -n` für Bash, Kustomize-Build für YAML).
- **Self-Repair-Loop (`scripts/factory/pipeline.js`):** Wenn `ACI_ENABLED=true` gesetzt ist, wird der grobe Schreib-Pfad durch den ACI-Loop ersetzt. Schlägt ein Edit oder nachfolgender Test fehl, führt das System bis zu `MAX_REPAIR=3` Reparatur-Iterationen aus, bevor es eskaliert.

## Tech-Stack

Node.js (CommonJS, `.cjs` pure module helper, `fs`, `child_process`).

## S1-Zeilenbudget (verbindlich vor Implementierung ermittelt)

| Datei | Ist | Baseline | wirksame Schwelle | Budget | Konsequenz |
|---|---|---|---|---|---|
| `scripts/factory/pipeline.js` | 639 | nicht-baselined | (S1-Ignore) | n/a | Sanktionierte Ausnahme (ignored in gates.yaml). Trotzdem: Änderungen extrem kompakt halten. |
| `scripts/factory/aci.cjs` | neu | — | 200 (`.cjs`) | Ziel < 180 | Reiner pure helper, muss kompakt geschnitten sein. |
| `scripts/factory/aci.test.cjs` | neu | — | 200 (`.cjs`) | Ziel < 150 | Unit-Tests für ACI-Hilfsfunktionen. |

## S3 / S4 Hinweise

- **S3:** Keine Hardcodierten Brand-Domains in ACI-Ausgaben oder Test-Mocks.
- **S4:** `scripts/factory/aci.cjs` wird von `pipeline.js` eingebunden. Unit-Tests werden in BATS verdrahtet.

## Tasks

### Task 1 — ACI-Hilfsfunktionen (`scripts/factory/aci.cjs`)
- [ ] `scripts/factory/aci.cjs` anlegen. Implementiert:
  - `view(file, start, end)` -> Zeigt nummerierte Zeilen.
  - `search(pattern, glob)` -> Dateisuche.
  - `edit(file, start, end, replacement)` -> Führt den Edit aus, ruft den typspezifischen Validator auf. Bei Fehlschlag: Revert via git checkout/backup-Inhalt, Rückgabe `{ failed: true, error: "Validator stdout/stderr" }`.
  - `test(file)` -> CLI-Testaufruf.
- [ ] Validatoren implementieren:
  - `.ts`/`.js`: `tsc --noEmit` oder `node --check`.
  - `.sh`: `bash -n`.
  - `.yaml`: `kustomize build` für Kustomize-Ordner oder Syntaxprüfung.
- **Acceptance:** `node --check scripts/factory/aci.cjs` läuft fehlerfrei; wc -l < 200.

### Task 2 — ACI-Unit-Tests (`scripts/factory/aci.test.cjs`)
- [ ] `scripts/factory/aci.test.cjs` schreiben, um `view`, `search`, `edit` und die Validatoren offline zu testen.
- [ ] Test für Auto-Revert: Ein fehlerhafter Edit (z. B. Syntaxfehler in TS-Datei schreiben) muss verworfen und die Originaldatei unberührt gelassen werden.
- **Acceptance:** `node scripts/factory/aci.test.cjs` exit 0.

### Task 3 — Integration des Loops in `pipeline.js`
- [ ] `pipeline.js` anpassen:
  - Prüfe `process.env.ACI_ENABLED === 'true'`.
  - Den alten Build-Pfad durch den ACI-Edit-Loop ersetzen.
  - Schleife mit `MAX_REPAIR=3` bei Fehlschlag von `aci.edit` oder `aci.test`.
  - Fehler zurück an das LLM spielen, damit es seinen Code anpassen kann.
  - Wenn alle Iterationen fehlschlagen: Harter, sichtbarer Abbruch (fail-closed).
- **Acceptance:** `node --check scripts/factory/pipeline.js` ist grün.

### Task 4 — BATS-Test & Eval-Harness Messung
- [ ] BATS-Test in `tests/local/FA-SF-59-aci-loop.bats` anlegen, der den gesamten ACI-Loop mitsamt dem Self-Repair-Verhalten simuliert.
- [ ] Die ACI-Schicht gegen das in T000930 gebaute Golden-Set in der Eval-Harness laufen lassen (`ACI_ENABLED=true` vs `false`).
- **Acceptance:** BATS-Tests laufen grün; die Eval-Scorecard zeigt eine Steigerung oder Stabilität des Scores mit ACI.

### Task 5 — Finale Verifikation (Pflicht-Gate)
- [ ] `task test:changed`
- [ ] `task freshness:regenerate`
- [ ] `task freshness:check`
- **Acceptance:** Alle Prüfungen grün.

## Verifikation (zusammengefasst)

```bash
node scripts/factory/aci.test.cjs
task test:factory
task test:all
task freshness:regenerate
task freshness:check
```
