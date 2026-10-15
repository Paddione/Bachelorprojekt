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

- Modify: `scripts/mcp/cbm-single-flight.sh` (98 Zeilen, nicht gebaselined,
  wirksame S1-Schwelle 800, Budget 702).
- Create: `tests/py/spec/cbm/test_begin_exit_status.py` (40 Zeilen,
  S1-Schwelle 800, ausreichend Reserve).

## Evidence

Basis: `544c1d6a4f8efd4c41276ba741fdd7a6a9f1c687`.
Graph-Anker: `home-patrick-Bachelorprojekt.scripts.mcp.cbm-single-flight`.
Quelltext bestätigt: `if ! BEGIN_OUT=$(...); then` setzt `$?` im Fehlerzweig
auf 0. Reproduktion mit echtem Helper: ungültiges JSON ergibt Helper-Code 2,
fehlendes Repository Code 1; der Wrapper gibt jeweils fälschlich 0 zurück.

Graph-Prüfung: CLI 0.11.0, Projekt `home-patrick-Bachelorprojekt`, Root
`/home/patrick/Bachelorprojekt`, Graph-Generation `2026-10-15T03:16:00Z`.
Single-Flight-Fast-Refresh erfolgreich, Receipt `2026-10-15T04:39:01.181045Z`
für Checkout `5076fc22bbf5eae65f7b01c96fe97b7e17d863b9` mit vier vorhandenen
Dirty-Dateien. Lokales `origin/main` ist acht Commits weiter; dieser Worktree
basiert auf diesem neueren Stand. Der Hauptcheckout wurde nicht verändert.
145 teilweise und sechs unbrauchbar geparste Dateien bleiben nach Refresh
bestehen. Alle 18 betroffenen Shell-Dateien bestehen `bash -n`; weitere
Parserdiagnosen sind keine nachgewiesenen Quellcodefehler. Auslassungen sind
als absichtlich ignoriert klassifiziert, nicht als Parse-Fehler.

`trace_path` für den Module-Anker, inbound/calls, Tiefe 2, Tests eingeschlossen,
liefert explizit keine Caller. Das belegt keine Abwesenheit von Aufrufern:
`taskfiles/Taskfile.data.yml` ruft den Wrapper für beide Index-Tasks auf.
Die Source-Beziehung ist verifiziert, Shell-Task-Aufrufe fehlen im CALLS-Pfad.
Coverage meldet für Wrapper und Freshness-Helper keine aufgezeichnete Lücke;
das ist keine Vollständigkeitsgarantie.

## Task 1: Regression belegen

- [x] `bash scripts/pytest-run.sh tests/py/spec/cbm/test_begin_exit_status.py -q`
  ausführen (pytest). Expected: FAIL in beiden Fällen (`0 == 2`, `0 == 1`).
- [x] Test verwendet isoliertes HOME und prüft unveränderte stderr-Ausgabe,
  leeres stdout sowie fehlende Attempt-/Receipt-Dateien.

## Task 2: Exit-Code erhalten

- [x] Negation entfernen und einen expliziten `else`-Zweig verwenden;
  dort ursprünglichen Status sofort in `BEGIN_RC` sichern.
- [x] Bestehendes Cleanup und Fehlerausgabe erhalten.
- [x] Regression und bestehende Stampede-Suite müssen erfolgreich sein:
  `bash scripts/pytest-run.sh tests/py/spec/cbm/test_begin_exit_status.py tests/py/spec/native_ported/spec/test_cbm_stampede_guard.py -q`.

## Task 3: Verify und Lieferung

- [x] `bash -n scripts/mcp/cbm-single-flight.sh`
- [ ] `task test:changed`
- [x] `task freshness:regenerate`
- [x] Artefakte gezielt committen; `task freshness:check`.
- [x] `task workspace:validate`
- [ ] PR erstellen, Required Checks prüfen und nach grünem Merge abschließen.
