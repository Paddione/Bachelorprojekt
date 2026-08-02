# plan-intel.sh Merge-Bestand: --out respektieren

## Purpose

`scripts/plan-intel.sh` liest beim Merge von Delta-Änderungen den vorhandenen `intel.json`-Bestand und die `.ticket`-Datei stets aus `$CHANGE_DIR` (hardcodiert auf `openspec/changes/<slug>/`). Der Parameter `--out` wird zwar zum Schreiben der Ausgabe verwendet, aber beim **Lesen** des Merge-Bestands ignoriert. Bei Aufrufen mit `--out /tmp/merge-out` werden dadurch Änderungen aus dem falschen Verzeichnis gelesen und gehen verloren.

## Requirements

### REQ-pi01: EXISTING_INTEL aus --out-Verzeichnis lesen

**GIVEN** `plan-intel.sh` wird mit `--out /tmp/merge-out/intel.json` aufgerufen
**WHEN** im `--out`-Verzeichnis existiert eine `intel.json` mit `api_contracts`, `external_types` und `risks`
**THEN** diese Werte werden in den Merge übernommen (nicht die aus `$CHANGE_DIR/intel.json`)

**GIVEN** `plan-intel.sh` wird OHNE `--out` aufgerufen
**WHEN** `$CHANGE_DIR/intel.json` existiert
**THEN** der Merge-Bestand wird aus `$CHANGE_DIR/intel.json` gelesen (bestehendes Verhalten, kein Regression)

### REQ-pi02: .ticket aus --out-Verzeichnis lesen

**GIVEN** `plan-intel.sh` wird mit `--out /tmp/merge-out/intel.json` aufgerufen
**WHEN** im `--out`-Verzeichnis existiert eine `.ticket`-Datei
**THEN** die Ticket-ID wird daraus gelesen (nicht aus `$CHANGE_DIR/.ticket`)

**GIVEN** `plan-intel.sh` wird OHNE `--out` aufgerufen ODER im `--out`-Verzeichnis existiert keine `.ticket`
**WHEN** `$CHANGE_DIR/.ticket` existiert
**THEN** die Ticket-ID wird aus `$CHANGE_DIR/.ticket` gelesen (Fallback)

## Scope

- Nur `scripts/plan-intel.sh` (Zeilen 46 und 183)
- Keine Änderung an Aufrufern — das Skriptverhalten wird repariert, die API bleibt gleich
- BATS-Testergänzung in `tests/spec/dev-flow-plan/plan-intel-risks-dedupe.bats`
