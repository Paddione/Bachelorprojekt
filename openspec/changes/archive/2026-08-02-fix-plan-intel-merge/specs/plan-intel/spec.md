# Spec Delta: plan-intel

## MODIFIED Requirements

### REQ-pi01: EXISTING_INTEL aus --out-Verzeichnis lesen

**GIVEN** `plan-intel.sh` wird mit `--out /tmp/merge-out/intel.json` aufgerufen
**WHEN** im `--out`-Verzeichnis existiert eine `intel.json` mit `api_contracts`, `external_types` und `risks`
**THEN** diese Werte werden in den Merge übernommen (nicht die aus `$CHANGE_DIR/intel.json`)

**GIVEN** `plan-intel.sh` wird OHNE `--out` aufgerufen
**WHEN** `$CHANGE_DIR/intel.json` existiert
**THEN** der Merge-Bestand wird aus `$CHANGE_DIR/intel.json` gelesen (bestehendes Verhalten)

### REQ-pi02: .ticket aus --out-Verzeichnis lesen

**GIVEN** `plan-intel.sh` wird mit `--out /tmp/merge-out/intel.json` aufgerufen
**WHEN** im `--out`-Verzeichnis existiert eine `.ticket`-Datei
**THEN** die Ticket-ID wird daraus gelesen (nicht aus `$CHANGE_DIR/.ticket`)

**GIVEN** `plan-intel.sh` wird OHNE `--out` aufgerufen ODER im `--out`-Verzeichnis existiert keine `.ticket`
**WHEN** `$CHANGE_DIR/.ticket` existiert
**THEN** die Ticket-ID wird aus `$CHANGE_DIR/.ticket` gelesen (Fallback)
