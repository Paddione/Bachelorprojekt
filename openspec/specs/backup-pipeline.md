# backup-pipeline

<!-- baseline SSOT — generiert aus Codebase-Analyse am 2026-06-20 -->

Beschreibt die automatisierte Backup-Pipeline des Workspace: tägliche verschlüsselte
PostgreSQL-Dumps (`db-backup` CronJob, 02:00 UTC) und PVC-Datei-Archive (`pvc-backup`
CronJob, 03:00 UTC), lokale Aufbewahrung auf `backup-pvc` (30 Tage), optionaler
Remote-Upload zu Filen Cloud, sowie Wiederherstellungs- und Disaster-Recovery-Operationen
via `scripts/backup-restore.sh`.

---

### Requirement: Tägliche verschlüsselte PostgreSQL-Dumps

The system SHALL produce daily encrypted PostgreSQL dumps for all four service databases
(keycloak, nextcloud, vaultwarden, website) at 02:00 UTC using `pg_dump -Fc` format,
with each dump encrypted via AES-256-CBC + PBKDF2 before writing to `backup-pvc`.

#### Scenario: Erfolgreicher nächtlicher DB-Backup

- **GIVEN** `shared-db` ist erreichbar und alle Service-Passwörter sind in `workspace-secrets` vorhanden
- **WHEN** der `db-backup` CronJob um 02:00 UTC feuert
- **THEN** werden vier `.dump.enc`-Dateien (keycloak, nextcloud, vaultwarden, website) im Verzeichnis `/backups/<YYYYMMDD-HHMMSS>/` auf `backup-pvc` abgelegt

#### Scenario: Dump-Validierung verhindert Encrypt-then-publish von Garbage

- **GIVEN** `pg_dump` schlägt fehl oder produziert eine Ausgabe < 200 Bytes ohne `PGDMP`-Magic-Header
- **WHEN** der Post-Flight-Check ausgeführt wird
- **THEN** bricht der Job mit Exit 1 ab, bevor die Datei verschlüsselt oder auf Filen hochgeladen wird

#### Scenario: Pre-Flight verhindert leere Dumps bei DB-Ausfall

- **GIVEN** `shared-db` ist nicht erreichbar (z. B. Pod-Neustart oder Netzwerkpartitionierung)
- **WHEN** der `db-backup`-Container startet und `pg_isready` aufruft
- **THEN** bricht der Job sofort mit einer Fehlermeldung ab, ohne leere `.dump`-Dateien anzulegen

---

### Requirement: Tägliche verschlüsselte PVC-Datei-Archive

The system SHALL produce daily encrypted tar.gz archives of Nextcloud file data and
Vaultwarden data volumes at 03:00 UTC, with each archive encrypted via AES-256-CBC +
PBKDF2 before writing to `backup-pvc`.

#### Scenario: PVC-Backup mit Longhorn-Clone (mentolder)

- **GIVEN** `vaultwarden-data-pvc` hat StorageClass `longhorn`
- **WHEN** der `pvc-backup` CronJob startet
- **THEN** erstellt der Orchestrator einen CSI-Clone (`vaultwarden-data-backup-clone`) und archiviert dessen Inhalt, ohne das Live-Volume zu blockieren; der Clone wird nach Abschluss gelöscht

#### Scenario: PVC-Backup ohne Longhorn (korczewski / local-path)

- **GIVEN** `vaultwarden-data-pvc` hat StorageClass `local-path`
- **WHEN** der `pvc-backup` CronJob startet
- **THEN** wird das Live-Volume direkt (readOnly) durch den Mounter-Job gemountet, der via `podAffinity` auf denselben Node wie der Vaultwarden-Pod geplant wird, um den RWO-Mount zu ermöglichen

---

### Requirement: Lokale 30-Tage-Retention

The system SHALL automatically delete backup directories older than 30 days from
`backup-pvc` at the end of each successful backup run, keeping at most 30 days of
local backup history.

#### Scenario: Alte Backups werden bereinigt

- **GIVEN** es liegen Backup-Verzeichnisse auf `backup-pvc` vor, die älter als 30 Tage sind
- **WHEN** ein Backup-Job (DB oder PVC) erfolgreich abgeschlossen wird
- **THEN** werden alle Verzeichnisse mit `mtime > 30 Tage` per `find -mtime +30 -exec rm -rf` gelöscht

---

### Requirement: Optionaler Remote-Upload zu Filen Cloud

The system SHALL upload completed encrypted backup archives to Filen Cloud using the
`@filen/cli` tool when `FILEN_EMAIL` and `FILEN_PASSWORD` are configured in
`workspace-secrets`; if these credentials are absent, the upload step SHALL be skipped
without failing the job.

#### Scenario: Filen konfiguriert — Upload nach lokalem Backup

- **GIVEN** `FILEN_EMAIL` und `FILEN_PASSWORD` sind in `workspace-secrets` gesetzt
- **WHEN** der `backup`-Container die `.done`-Signaldatei in `/staging/` schreibt
- **THEN** installiert der `filen-upload`-Sidecar `@filen/cli` und lädt alle verschlüsselten Dateien in `<FILEN_DEFAULT_UPLOAD_PATH>/<STAMP>/` auf Filen hoch; ein Fehler beim Upload beendet den Container mit Exit 1

#### Scenario: Filen nicht konfiguriert — lokaler Backup genügt

- **GIVEN** `FILEN_EMAIL` oder `FILEN_PASSWORD` fehlen in `workspace-secrets` (optional-markierte Keys)
- **WHEN** der `filen-upload`-Sidecar startet
- **THEN** loggt er "Filen not configured — skipping remote backup" und beendet sich mit Exit 0; der lokale Backup auf `backup-pvc` ist vollständig

#### Scenario: Upload-Pfad aus Datenbank überschreibt ConfigMap-Default

- **GIVEN** `site_settings` in der `website`-DB enthält einen Eintrag `key='filen_upload_path'` für die aktive Brand
- **WHEN** der `db-backup`-Container nach Abschluss der Dumps den Upload-Pfad auflöst
- **THEN** verwendet `filen-upload` diesen DB-Wert statt des `FILEN_DEFAULT_UPLOAD_PATH` aus der `backup-config` ConfigMap

---

### Requirement: Disaster Recovery via Filen-Pull

The system SHALL support pulling a specific backup timestamp from Filen Cloud into a
fresh or empty `backup-pvc` so that the existing `restore` and `pvc-restore` commands
can run on a cluster where local backups do not exist.

#### Scenario: Filen-Pull auf frischem Cluster

- **GIVEN** der Cluster ist neu deployed und `backup-pvc` ist leer, aber Filen-Credentials sind in `workspace-secrets` vorhanden
- **WHEN** `scripts/backup-restore.sh filen-pull <timestamp>` ausgeführt wird
- **THEN** startet ein Kubernetes-Job, der `@filen/cli download` aufruft und das Verzeichnis `<FILEN_DEFAULT_UPLOAD_PATH>/<timestamp>/` in `/backups/<timestamp>/` auf `backup-pvc` herunterlädt

---

### Requirement: Verschlüsselte Wiederherstellung (DB und PVC)

The system SHALL restore databases or PVC archives from encrypted backup files on
`backup-pvc` by decrypting with the `BACKUP_PASSPHRASE` from `workspace-secrets` and
applying the result to the live target; the restore SHALL require explicit operator
confirmation unless the `--yes` flag is passed.

#### Scenario: Datenbank-Restore aus einem Backup-Timestamp

- **GIVEN** ein gültiger Backup-Timestamp existiert in `backup-pvc` und `BACKUP_PASSPHRASE` ist korrekt
- **WHEN** `scripts/backup-restore.sh restore <db> <timestamp>` mit Bestätigung ausgeführt wird
- **THEN** wird die Zieldatenbank terminiert, gedroppt, neu erstellt und per `pg_restore` aus dem entschlüsselten Dump befüllt; der Job schlägt fehl, wenn die `.dump.enc`-Datei nicht im Timestamp-Verzeichnis gefunden wird

#### Scenario: PVC-Restore erfordert Scale-Down des Ziel-Service

- **GIVEN** ein Nextcloud- oder Vaultwarden-Pod läuft auf dem Cluster
- **WHEN** `scripts/backup-restore.sh pvc-restore <service> <timestamp>` ausgeführt wird
- **THEN** gibt das Skript explizite Skalierungsanweisungen aus und erfordert Bestätigung; der Restore-Job überschreibt den PVC-Inhalt vollständig

---

### Requirement: Granulare Staged Recovery (Tabellen und Dateien)

The system SHALL support staging a backup into a read-only inspection environment
(a `<db>_recovery` database or `recovery-pvc:/recovery/<ts>/`) without touching the
live data, and allow selective restoration of individual tables or file paths from
the staged copy.

#### Scenario: DB-Dump in Staging-Datenbank laden

- **GIVEN** ein gültiger Backup-Timestamp ist auf `backup-pvc` vorhanden
- **WHEN** `scripts/backup-restore.sh stage <timestamp> <db>` ausgeführt wird
- **THEN** wird der Dump in eine separate `<db>_recovery`-Datenbank auf `shared-db` entschlüsselt und geladen, ohne die Live-Datenbank zu berühren

#### Scenario: Einzelne Tabelle aus Staging in Live-DB zurückschreiben

- **GIVEN** eine `<db>_recovery`-Datenbank existiert mit dem Backup-Stand
- **WHEN** `scripts/backup-restore.sh restore-table <timestamp> <db> <table>` ausgeführt wird
- **THEN** wird nur die angegebene Tabelle per `pg_restore -t <table>` in die Live-Datenbank zurückgeschrieben

#### Scenario: Dump-Integrität per verify-Befehl prüfen

- **GIVEN** ein Backup-Timestamp liegt auf `backup-pvc`
- **WHEN** `scripts/backup-restore.sh verify <timestamp> <db>` ausgeführt wird
- **THEN** wird der verschlüsselte Dump in eine temporäre Datenbank restoriert, alle Tabellen-Zähler werden ausgegeben, und die temporäre Datenbank wird anschließend wieder gelöscht; der Job schlägt fehl, wenn der Dump nicht restorierbar ist
