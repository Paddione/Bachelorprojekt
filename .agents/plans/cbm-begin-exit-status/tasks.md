---
title: K3-Refresh meldet Vorbereitungsfehler korrekt
ticket_id: none-retired
domains: [scripts, scripts-infra]
status: staged
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---
# cbm-begin-exit-status — Implementation Plan

Zweck: Ein fehlgeschlagener `cbm-freshness.py begin` muss den Refresh mit
dem ursprünglichen Exit-Code abbrechen. Keine Änderungen an Parsern oder
fachlichem Anwendungscode.

## File Structure

- Modify: `scripts/mcp/cbm-single-flight.sh` (96 Zeilen, nicht gebaselined,
  wirksame S1-Schwelle 800, Budget 704; Änderung ohne Wachstum).
- Create: `tests/py/spec/cbm/test_begin_exit_status.py` (42 Zeilen,
  S1-Schwelle 800, ausreichend Reserve).

## Evidence

Basis: `544c1d6a4f8efd4c41276ba741fdd7a6a9f1c687`.
Graph-Anker: `home-patrick-Bachelorprojekt.scripts.mcp.cbm-single-flight`.
Quelltext bestätigt: `if ! BEGIN_OUT=$(...); then` setzt `$?` im Fehlerzweig
auf 0. Reproduktion mit echtem Helper: ungültiges JSON ergibt Helper-Code 2,
fehlendes Repository Code 1; der Wrapper gibt jeweils fälschlich 0 zurück.

## Task 1: Regression belegen

- [x] `bash scripts/pytest-run.sh tests/py/spec/cbm/test_begin_exit_status.py -q`
  ausführen. Erwartung: FAIL in beiden Fällen (`0 == 2`, `0 == 1`).
- [x] Test verwendet isoliertes HOME und prüft unveränderte stderr-Ausgabe,
  leeres stdout sowie fehlende Attempt-/Receipt-Dateien.

## Task 2: Exit-Code erhalten

- [ ] Negation entfernen und einen expliziten `else`-Zweig verwenden;
  dort ursprünglichen Status sofort in `BEGIN_RC` sichern.
- [ ] Bestehendes Cleanup und Fehlerausgabe erhalten.
- [ ] Regression und bestehende Stampede-Suite müssen erfolgreich sein:
  `bash scripts/pytest-run.sh tests/py/spec/cbm/test_begin_exit_status.py tests/py/spec/native_ported/spec/test_cbm_stampede_guard.py -q`.

## Task 3: Verify und Lieferung

- [ ] `bash -n scripts/mcp/cbm-single-flight.sh`
- [ ] `task test:changed`
- [ ] `task freshness:regenerate`
- [ ] Artefakte gezielt committen; `task freshness:check`.
- [ ] `task workspace:validate`
- [ ] PR erstellen, Required Checks prüfen und nach grünem Merge abschließen.
