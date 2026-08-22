## ADDED Requirements

### Requirement: Remote-Retention auf Filen (14 Generationen je Pfad)

The system SHALL prune remote backup generations on Filen after each successful
upload so that at most 14 generation directories remain per upload path
(configurable via `FILEN_REMOTE_RETENTION`), keeping quota consumption on the
10 GiB free tier at a plateau instead of growing indefinitely (~154 MiB/day).

#### Scenario: Älteste Generationen werden nach erfolgreichem Upload gelöscht

- **GIVEN** der `filen-upload`-Sidecar hat `<UPLOAD_PATH>/<STAMP>/` erfolgreich hochgeladen und liegen remote mehr als 14 Generierungs-Verzeichnisse im Upload-Pfad
- **WHEN** der Retention-Schritt `filen ls <UPLOAD_PATH>` auswertet
- **THEN** werden genau die ältesten `COUNT - RETENTION` Verzeichnisse whose names match `^(pvc-)?[0-9]{8}-[0-9]{6}$` per `filen rm -y` soft-deleted, die neuesten 14 bleiben erhalten, und Einträge, die dem Generierungs-Muster nicht entsprechen, werden nie angerührt

#### Scenario: CLI-Hangs und Rate-Limits sind entschärft

- **GIVEN** die Filen CLI v0.0.39 kann bei `trash-empty`/`trash-delete` hängen und limitiert ~30 Logins/min (jeder CLI-Aufruf ist ein Login)
- **WHEN** der Retention-Schritt läuft
- **THEN** wird ausschließlich Soft-Delete via `filen rm -y` verwendet, jeder `filen`-Aufruf ist mit `timeout` umschlossen (120s für `ls`, 90s für `rm`), trägt `--skip-update --no-autocomplete`, und zwischen Löschungen wird 3s gedrosselt

#### Scenario: Fehlgeschlagener Prune wird nicht still geschluckt

- **GIVEN** `filen ls` oder ein `filen rm -y` schlägt fehl (nach spätestens 5 Fehlern wird abgebrochen)
- **WHEN** der Retention-Schritt endet
- **THEN** beendet sich der Container mit Exit 1, sodass der Defekt als Failed Job mit `DBBackupJobFailed`-Alert sichtbar wird, statt die Quota-Voll-Outage schleichend zu reproduzieren

#### Scenario: Akzeptanz — Quota-Verbrauch plateaued

- **GIVEN** die Retention ist deployed und läuft täglich
- **WHEN** 14 Tage vergangen sind
- **THEN** liegen remote ≤15 Generationen je Pfad (db-Stamps und pvc-Stamps getrennt gemustert, gemeinsamer Elternpfad) und der Filen-Account erreicht keinen "Maximum storage reached"-Zustand mehr
