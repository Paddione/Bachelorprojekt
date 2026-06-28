# g-size01-freeze-warning-band

## Purpose

Diese Capability definiert das präventive Refactoring-Ziel für das S1-Freeze-Frühwarn-Band im Repository. 39 In-Scope-Quelldateien befinden sich bei 80–100 % ihres per-Extension S1-Limits und sind damit die unmittelbaren Freeze-Kandidaten: jede weitere hinzugefügte Zeile erzeugt einen neuen Eintrag in `docs/code-quality/baseline.json` (G-RH01-Schuld) und blockiert Feature-Entwicklung. Das Ziel ist es, durch gezieltes Herausziehen von Helpern, Sub-Komponenten und Test-Partials die Zahl der Dateien im Warn-Band von 39 auf ≤ 15 zu senken, ohne Verhalten zu ändern.

## ADDED Requirements

### Requirement: REQ-SIZE01-MEASURE

The G-SIZE01 measure command runs reproducibly without cluster, network, or build-step dependencies.

GIVEN the repository is checked out and `docs/code-quality/baseline.json` exists,
WHEN the Python measure script from `goals.md` section G-SIZE01 is executed,
THEN it prints `Warn-Band 80-100%: <N>` where N is an exact integer count of in-scope source files between 80 % and 100 % of their per-extension S1 limit.

### Requirement: REQ-SIZE01-TARGET

After all planned splits are applied, the warn-band count must fall to at most 15.

GIVEN all extractions from Batch 1 (9 files ≥ 95 %) and Batch 2 (15 files at 80–95 %) have been applied and committed,
WHEN the G-SIZE01 measure command is executed,
THEN it prints `Warn-Band 80-100%: 15` or lower.

### Requirement: REQ-SIZE01-NO-BEHAVIOR-CHANGE

Each extraction leaves the public API and runtime behavior of the affected modules unchanged.

GIVEN a file is split by extracting a helper module or sub-component,
WHEN the original file imports from the new helper file and all callers are updated,
THEN `task test:changed` passes without new failures and `task freshness:check` exits 0.

### Requirement: REQ-SIZE01-SPLIT-SIZING

Each new extracted file must itself remain outside the warn band after extraction.

GIVEN a helper, sub-component, or test partial is extracted into a new file,
WHEN the new file line count is measured,
THEN the new file is at most 70 % of its per-extension S1 limit (providing a 10 % buffer below the 80 % warn threshold).

### Requirement: REQ-SIZE01-NO-NEW-FREEZE

No file touched in this change set must cross its S1 limit and enter `docs/code-quality/baseline.json`.

GIVEN all splits have been applied,
WHEN `task quality:check` is executed,
THEN no new entries appear in `docs/code-quality/baseline.json` compared to the baseline before this change.

### Requirement: REQ-SIZE01-HEALTH-GATE

The `health-goals-check.sh` script reports G-SIZE01 as green after all changes are applied.

GIVEN the warn-band count is ≤ 15,
WHEN `bash scripts/health-goals-check.sh --only=G-SIZE01` is executed,
THEN exit code is 0 and the output shows G-SIZE01 in the green (TARGET MET) state.

## Acceptance Criteria

- THEN der Measure-Command liefert `Warn-Band 80-100%: 15` oder kleiner
- THEN `bash scripts/health-goals-check.sh --only=G-SIZE01` gibt Exit 0 zurück und zeigt G-SIZE01 grün
- THEN kein neu extrahiertes Helper-Modul überschreitet 70 % seines per-Extension S1-Limits
- THEN `task test:changed` läuft ohne neue Fehlschläge durch
- THEN `task freshness:check` gibt Exit 0 zurück
- THEN `docs/code-quality/baseline.json` enthält keine neuen Einträge durch diesen Change
