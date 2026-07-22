# backup-pipeline

<!-- baseline SSOT — generiert aus Codebase-Analyse am 2026-06-20 -->

## Purpose

Beschreibt die automatisierte Backup-Pipeline des Workspace: tägliche verschlüsselte
PostgreSQL-Dumps (`db-backup` CronJob, 02:00 UTC) und PVC-Datei-Archive (`pvc-backup`
CronJob, 03:00 UTC), lokale Aufbewahrung auf `backup-pvc` (30 Tage), optionaler
Remote-Upload zu Filen Cloud, sowie Wiederherstellungs- und Disaster-Recovery-Operationen
via `scripts/backup-restore.sh`.

---

## Requirements

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

---

### Requirement: filen-pull Argument-Validierung

The system SHALL reject `filen-pull` invocations without a timestamp argument and print
a usage message, and SHALL list `filen-pull` in the `--help` output.

#### Scenario: filen-pull ohne Timestamp schlägt fehl

- **GIVEN** `scripts/backup-restore.sh` ist vorhanden
- **WHEN** `scripts/backup-restore.sh filen-pull` ohne weiteres Argument aufgerufen wird
- **THEN** beendet sich das Skript mit Exit 1 und gibt einen `Usage`-Hinweis aus

#### Scenario: --help enthält filen-pull

- **GIVEN** `scripts/backup-restore.sh` ist vorhanden
- **WHEN** `scripts/backup-restore.sh --help` aufgerufen wird
- **THEN** ist `filen-pull` in der Ausgabe enthalten und das Skript beendet sich mit Exit 0

---

### Requirement: restore-file — Einzelne Datei aus Staging in Live-PVC

The system SHALL support restoring a single file path from the `recovery-pvc` staging
area back into the live service PVC via `restore-file <timestamp> <service> <path>`,
and SHALL require explicit confirmation unless `--yes` / `-y` is passed.

#### Scenario: Einzelne Datei wird aus Staging in Live-PVC kopiert

- **GIVEN** eine gestagete Datei liegt unter `/recovery/pvc-20260530-030001/nextcloud-files/admin/files/Doc.pdf` auf `recovery-pvc`
- **WHEN** `scripts/backup-restore.sh restore-file pvc-20260530-030001 nextcloud-files admin/files/Doc.pdf -y` aufgerufen wird
- **THEN** rendert das Skript einen Job, der `recovery-pvc` und `nextcloud-data-pvc` mountet und den angegebenen Pfad aus dem Staging-Bereich in den Live-PVC kopiert

#### Scenario: restore-file ohne -y wird abgebrochen

- **GIVEN** der Operator gibt keine `-y`-Flag an und antwortet mit `no` auf die Rückfrage
- **WHEN** `scripts/backup-restore.sh restore-file pvc-20260530-030001 nextcloud-files admin/files/Doc.pdf` aufgerufen wird
- **THEN** beendet sich das Skript mit Exit 1 und gibt `Aborted` aus; keine Kubernetes-Ressource wird erstellt

---

### Requirement: browse — Recovery-UI starten

The system SHALL apply the `recovery-browser.yaml` manifest (rendered through `envsubst`)
when `browse` is called, and SHALL print the recovery URL derived from the
`domain-config` ConfigMap.

#### Scenario: browse gibt die Recovery-URL aus

- **GIVEN** die `domain-config` ConfigMap liefert `recover.localhost` und `k3d/recovery-browser.yaml` existiert
- **WHEN** `scripts/backup-restore.sh browse` aufgerufen wird
- **THEN** beendet sich das Skript mit Exit 0 und gibt eine URL aus, die `recover.` enthält

#### Scenario: browse rendert das Manifest durch envsubst (kein Raw-Apply)

- **GIVEN** `k3d/recovery-browser.yaml` enthält Template-Variablen wie `${RECOVER_DOMAIN}`
- **WHEN** der Skript-Quelltext auf den Befehl `$KC apply -n "$NS" -f "$MANIFEST"` (Raw-Apply) geprüft wird
- **THEN** ist dieser exakte Raw-Apply-Ausdruck **nicht** im Skript vorhanden; stattdessen läuft das Manifest durch `envsubst`

---

### Requirement: unstage — Staging-Zustand bereinigen

The system SHALL delete `*_recovery` databases and clear the staging directory for a
given timestamp when `unstage <timestamp>` is called, requiring `-y` for confirmation.

#### Scenario: unstage löscht Staging-Verzeichnis für einen Timestamp

- **GIVEN** ein Staging-Verzeichnis `/recovery/pvc-20260530-030001` existiert auf `recovery-pvc`
- **WHEN** `scripts/backup-restore.sh unstage pvc-20260530-030001 -y` aufgerufen wird
- **THEN** enthält das generierte YAML den Pfad `/recovery/pvc-20260530-030001` und der Zustand wird bereinigt

---

### Requirement: --help listet alle Recovery-Subcommands

The system SHALL list `stage`, `verify`, `restore-file`, `restore-table`, and `browse`
in the `--help` output so operators can discover all recovery operations.

#### Scenario: --help enthält alle Recovery-Befehle

- **GIVEN** `scripts/backup-restore.sh` ist vorhanden
- **WHEN** `scripts/backup-restore.sh --help` aufgerufen wird
- **THEN** enthält die Ausgabe `stage`, `verify`, `restore-file`, `restore-table` und `browse`, und das Skript beendet sich mit Exit 0

---

### Requirement: RECOVER_DOMAIN in Prod-Konfiguration und envsubst-Liste

The system SHALL define `RECOVER_DOMAIN` in `prod/configmap-domains.yaml` and include
it in the `ENVSUBST_VARS` list in `Taskfile.yml`, so that a production deploy does not
leave the recovery Ingress host set to the dev value `recover.localhost`.

#### Scenario: prod/configmap-domains.yaml definiert RECOVER_DOMAIN

- **GIVEN** `prod/configmap-domains.yaml` ist die produktive Überschreibung der Base-Domain-ConfigMap
- **WHEN** die Datei auf den Schlüssel `RECOVER_DOMAIN` geprüft wird
- **THEN** ist `RECOVER_DOMAIN:` im Datei-Inhalt vorhanden, sodass der Strategic-Merge den Dev-Wert `recover.localhost` überschreibt

#### Scenario: ENVSUBST_VARS im Taskfile enthält RECOVER_DOMAIN

- **GIVEN** `Taskfile.yml` definiert `ENVSUBST_VARS` für den Prod-Deploy
- **WHEN** die Variable auf Vollständigkeit geprüft wird
- **THEN** enthält `ENVSUBST_VARS` den Eintrag `RECOVER_DOMAIN`, sodass domain-config und Realm-Template korrekt substituiert werden

---

### Requirement: Memory-backed /dev/shm on shared-db for restorable dumps

The shared-db Deployment SHALL mount a Memory-backed emptyDir volume (`medium: Memory`, with an
explicit `sizeLimit`) at `/dev/shm` of the postgres container, so that PostgreSQL parallel
maintenance operations (notably pgvector HNSW index builds during `pg_restore`) are not capped by
the 64Mi container default. The sizeLimit SHALL stay below the smallest effective memory limit of
the postgres container across overlays (2Gi in `prod/patch-shared-db.yaml`).

#### Scenario: shared-db manifest declares the Memory-backed /dev/shm

- **GIVEN** `k3d/shared-db.yaml`
- **WHEN** `tests/spec/backup-pipeline.bats` parses the shared-db Deployment
- **THEN** a volume with `emptyDir.medium: Memory` and a non-empty `sizeLimit` exists
- **AND** the postgres container mounts that volume at `/dev/shm`

#### Scenario: Restore of the website dump completes on the deployed cluster

- **GIVEN** the fix is deployed and a current backup timestamp exists on backup-pvc
- **WHEN** `bash scripts/backup-restore.sh verify <timestamp> website --context fleet` runs
- **THEN** the verify job completes (including `CREATE INDEX chunks_embedding_hnsw`)
- **AND** the `recovery-verify-status` ConfigMap carries a fresh `last_success` stamp

### Requirement: Recovery-verify job cleans up its scratch database on failure

The recovery-verify job in `scripts/backup-restore-lib.sh` SHALL install an EXIT trap that drops
the scratch database (`<db>_verify_<pid>`) and removes the decrypted dump file even when
`pg_restore` aborts mid-run.

#### Scenario: Aborted verify leaves no scratch database behind

- **GIVEN** the verify job script block in `scripts/backup-restore-lib.sh`
- **WHEN** the block is inspected (or a verify run aborts)
- **THEN** a `trap cleanup EXIT` with `dropdb … --if-exists` guards the scratch DB

## Testszenarien

<!-- merged from BATS unit tests and Playwright e2e tests -->

### Requirement: filen-pull Argument-Validierung und Hilfe
<!-- bats: backup-restore-filen-pull.bats -->

The system SHALL reject `filen-pull` invocations without a timestamp argument and print a usage message, and SHALL list `filen-pull` in the `--help` output.

#### Scenario: filen-pull ohne Timestamp schlägt mit Usage-Meldung fehl *(BATS)*
- **GIVEN** `scripts/backup-restore.sh` ist vorhanden
- **WHEN** `scripts/backup-restore.sh filen-pull` ohne weiteres Argument aufgerufen wird
- **THEN** beendet sich das Skript mit Exit 1 und gibt eine `Usage`-Meldung aus

#### Scenario: --help enthält filen-pull *(BATS)*
- **GIVEN** `scripts/backup-restore.sh` ist vorhanden
- **WHEN** `scripts/backup-restore.sh --help` aufgerufen wird
- **THEN** enthält die Ausgabe `filen-pull` und das Skript beendet sich mit Exit 0

---

### Requirement: filen-pull Job-Struktur
<!-- bats: backup-restore-filen-pull.bats -->

The system SHALL render a Kubernetes Job for `filen-pull` that mounts `backup-pvc` writable (no `readOnly: true`), uses `node:22-alpine`, and writes the downloaded files to `/backups/<timestamp>/` on the PVC.

#### Scenario: Job mountet backup-pvc schreibbar und enthält korrektes Image *(BATS)*
- **GIVEN** `scripts/backup-restore.sh` ist vorhanden und kubectl ist als Stub konfiguriert
- **WHEN** `scripts/backup-restore.sh filen-pull 20260530-020001` ausgeführt wird
- **THEN** enthält das erzeugte Job-YAML `kind: Job`, `claimName: backup-pvc`, `node:22-alpine` und `/backups/20260530-020001/`; `readOnly: true` kommt im gesamten Job-YAML nicht vor

---

### Requirement: filen-pull Remote-Pfad-Auflösung
<!-- bats: backup-restore-filen-pull.bats -->

The system SHALL resolve the Filen remote base path from the `backup-config` ConfigMap by default, and SHALL honour a `--remote-path` flag to override it at call time.

#### Scenario: Remote-Pfad wird aus backup-config ConfigMap gelesen *(BATS)*
- **GIVEN** die `backup-config` ConfigMap liefert `/Backup` als Basis-Pfad
- **WHEN** `scripts/backup-restore.sh filen-pull pvc-20260530-030001` aufgerufen wird
- **THEN** enthält das Job-YAML den Remote-Pfad `/Backup/pvc-20260530-030001/`

#### Scenario: --remote-path Flag überschreibt ConfigMap-Default *(BATS)*
- **GIVEN** der Operator übergibt `--remote-path /custom/path`
- **WHEN** `scripts/backup-restore.sh filen-pull 20260530-020001 --remote-path /custom/path` aufgerufen wird
- **THEN** enthält das Job-YAML den Pfad `/custom/path/20260530-020001/` statt des ConfigMap-Wertes

---

### Requirement: Namespace-Parametrisierung (kein hardcodiertes `-n workspace`)
<!-- bats: backup-restore-namespace.bats -->

The system SHALL pass `-n "$NS"` to all `kubectl` invocations that read or write the `workspace-secrets` Secret, and SHALL NOT contain any literal `-n workspace` strings outside the single default assignment `NS=workspace`.

#### Scenario: Kein hardcodiertes `-n workspace` im Skript außerhalb der Default-Zuweisung *(BATS)*
- **GIVEN** `scripts/backup-restore.sh` enthält die Default-Zuweisung `NS=workspace`
- **WHEN** der Skript-Quelltext auf das Muster `-n workspace` (ohne Trailingzeichen `-`) geprüft wird
- **THEN** werden keine Treffer außerhalb der Default-Zuweisung gefunden (Exit 1 des grep = kein Match)

#### Scenario: Alle kubectl-Secret-Lookups tragen `-n "$NS"` *(BATS)*
- **GIVEN** `scripts/backup-restore.sh` greift auf das Secret `workspace-secrets` zu
- **WHEN** jedes `kubectl`-Kommando mit `workspace-secrets`-Referenz auf den Namespace-Flag geprüft wird
- **THEN** tragen alle derartigen Kommandos `-n "$NS"` und keines davon ist ohne Namespace-Flag

---

### Requirement: Granulare Staged Recovery — stage, verify, restore-file, restore-table
<!-- bats: backup-restore-recovery.bats -->

The system SHALL support staging a backup into a read-only inspection environment without touching the live data, and allow selective restoration of individual tables or file paths from the staged copy.

#### Scenario: stage ohne Argumente schlägt mit Usage-Meldung fehl *(BATS)*
- **GIVEN** `scripts/backup-restore.sh` ist vorhanden
- **WHEN** `scripts/backup-restore.sh stage` ohne weitere Argumente aufgerufen wird
- **THEN** beendet sich das Skript mit Exit 1 und gibt eine `Usage`-Meldung aus

#### Scenario: stage einer DB erzeugt pg_restore-Job in `<db>_recovery` ohne die Live-DB zu berühren *(BATS)*
- **GIVEN** kubectl ist als Stub konfiguriert und der YAML-Capture ist bereit
- **WHEN** `scripts/backup-restore.sh stage 20260530-020001 website -y` ausgeführt wird
- **THEN** enthält das erzeugte Job-YAML `kind: Job`, `website.dump.enc`, `createdb … website_recovery` und `pg_restore … -d website_recovery`; ein `dropdb … website ` (Live-DB) kommt nicht vor

#### Scenario: stage eines Service-Archivs extrahiert in recovery-pvc unter `/recovery/<ts>/<service>` *(BATS)*
- **GIVEN** kubectl ist als Stub konfiguriert
- **WHEN** `scripts/backup-restore.sh stage pvc-20260530-030001 nextcloud-files -y` ausgeführt wird
- **THEN** enthält das erzeugte Job-YAML `nextcloud-files.tar.gz.enc`, `claimName: recovery-pvc`, `/recovery/pvc-20260530-030001/nextcloud-files` und `claimName: backup-pvc` (Backup-Quelle read-only)

#### Scenario: verify erzeugt Job, der Dump in temporäre DB restoriert, zählt und löscht *(BATS)*
- **GIVEN** kubectl ist als Stub konfiguriert
- **WHEN** `scripts/backup-restore.sh verify 20260530-020001 website` ausgeführt wird
- **THEN** enthält das erzeugte Job-YAML `website.dump.enc`, `createdb … shared-db`, `information_schema.tables` (Tabellen-Zähler) und `dropdb … --if-exists` (Cleanup)

#### Scenario: restore-file kopiert einen Pfad aus Staging in den Live-PVC (mit -y) *(BATS)*
- **GIVEN** kubectl ist als Stub konfiguriert
- **WHEN** `scripts/backup-restore.sh restore-file pvc-20260530-030001 nextcloud-files admin/files/Doc.pdf -y` ausgeführt wird
- **THEN** enthält das erzeugte Job-YAML `claimName: recovery-pvc`, `claimName: nextcloud-data-pvc` und `/recovery/pvc-20260530-030001/nextcloud-files/admin/files/Doc.pdf`

#### Scenario: restore-file verlangt Bestätigung ohne -y Flag *(BATS)*
- **GIVEN** der Operator gibt keine `-y`-Flag an und antwortet mit `no` auf die Rückfrage
- **WHEN** `scripts/backup-restore.sh restore-file pvc-20260530-030001 nextcloud-files admin/files/Doc.pdf` aufgerufen wird
- **THEN** beendet sich das Skript mit Exit 1 und gibt `Aborted` aus; keine Kubernetes-Ressource wird erstellt

#### Scenario: restore-table rendert pg_restore -t `<table>` in die Live-DB (mit -y) *(BATS)*
- **GIVEN** kubectl ist als Stub konfiguriert
- **WHEN** `scripts/backup-restore.sh restore-table 20260530-020001 website site_settings -y` ausgeführt wird
- **THEN** enthält das erzeugte Job-YAML `website.dump.enc`, `pg_restore … -d website` und `-t site_settings`

#### Scenario: browse appliziert das Recovery-Browser-Manifest und gibt die URL aus *(BATS)*
- **GIVEN** kubectl ist als Stub konfiguriert und gibt `recover.localhost` für domain-config zurück
- **WHEN** `scripts/backup-restore.sh browse` ausgeführt wird
- **THEN** beendet sich das Skript mit Exit 0 und die Ausgabe enthält `recover.`

#### Scenario: unstage löscht `*_recovery`-DBs und bereinigt das Staging-Verzeichnis *(BATS)*
- **GIVEN** kubectl ist als Stub konfiguriert
- **WHEN** `scripts/backup-restore.sh unstage pvc-20260530-030001 -y` ausgeführt wird
- **THEN** enthält das erzeugte YAML den Pfad `/recovery/pvc-20260530-030001`

#### Scenario: --help listet alle Recovery-Subcommands *(BATS)*
- **GIVEN** `scripts/backup-restore.sh` ist vorhanden
- **WHEN** `scripts/backup-restore.sh --help` aufgerufen wird
- **THEN** enthält die Ausgabe `stage`, `verify`, `restore-file`, `restore-table` und `browse`; das Skript beendet sich mit Exit 0

---

### Requirement: recovery-browser.yaml Manifest-Struktur
<!-- bats: recovery-browser-manifest.bats -->

The system SHALL ship a `k3d/recovery-browser.yaml` manifest that mounts `recovery-pvc` read-only, gates access via oauth2-proxy restricted to `/recovery-access`, and is NOT registered in the base kustomization.

#### Scenario: Manifest existiert und ist gültiges YAML *(BATS)*
- **GIVEN** `k3d/recovery-browser.yaml` liegt im Repository
- **WHEN** das Manifest per Python-YAML-Parser eingelesen wird
- **THEN** schlägt das Parsen nicht fehl (Exit 0)

#### Scenario: Filebrowser mountet recovery-pvc read-only *(BATS)*
- **GIVEN** `k3d/recovery-browser.yaml` ist vorhanden
- **WHEN** der Mount von `recovery-pvc` im Manifest geprüft wird
- **THEN** ist `readOnly: true` direkt nach `claimName: recovery-pvc` gesetzt

#### Scenario: oauth2-proxy ist auf die `/recovery-access`-Gruppe beschränkt *(BATS)*
- **GIVEN** `k3d/recovery-browser.yaml` ist vorhanden
- **WHEN** die oauth2-proxy-Konfiguration geprüft wird
- **THEN** enthält das Manifest `--allowed-groups=/recovery-access`

#### Scenario: oauth2-proxy nutzt den recovery-Client und routet zum Filebrowser *(BATS)*
- **GIVEN** `k3d/recovery-browser.yaml` ist vorhanden
- **WHEN** Client-ID und Upstream der oauth2-proxy-Konfiguration geprüft werden
- **THEN** enthält das Manifest `--client-id=recovery` und `--upstream=http://recovery-browser`

#### Scenario: Ingress routet die recover-Domain *(BATS)*
- **GIVEN** `k3d/recovery-browser.yaml` ist vorhanden
- **WHEN** das Manifest auf Ingress-Ressource und Domain-Platzhalter geprüft wird
- **THEN** enthält es `kind: Ingress` und `RECOVER_DOMAIN`

#### Scenario: recovery-browser.yaml ist nicht in der Base-Kustomization registriert *(BATS)*
- **GIVEN** `k3d/kustomization.yaml` ist die Base-Kustomization
- **WHEN** die Kustomization auf `recovery-browser.yaml` geprüft wird
- **THEN** ist `recovery-browser.yaml` nicht darin enthalten (on-demand apply only)

---

### Requirement: RECOVER_DOMAIN in Prod-Konfiguration und envsubst-Rendering
<!-- bats: recovery-domain-durability.bats -->

The system SHALL define `RECOVER_DOMAIN` in `prod/configmap-domains.yaml`, include it in `ENVSUBST_VARS` in `Taskfile.yml`, and render `recovery-browser.yaml` through `envsubst` (never raw-apply) so that a production deploy does not leave the recovery Ingress host set to the dev value `recover.localhost`.

#### Scenario: prod/configmap-domains.yaml definiert RECOVER_DOMAIN *(BATS)*
- **GIVEN** `prod/configmap-domains.yaml` ist die produktive Überschreibung der Base-Domain-ConfigMap
- **WHEN** die Datei auf den Schlüssel `RECOVER_DOMAIN` geprüft wird
- **THEN** ist `RECOVER_DOMAIN:` im Datei-Inhalt vorhanden

#### Scenario: ENVSUBST_VARS im Taskfile enthält RECOVER_DOMAIN *(BATS)*
- **GIVEN** `Taskfile.yml` definiert `ENVSUBST_VARS` für den Prod-Deploy
- **WHEN** die Variable auf Vollständigkeit geprüft wird
- **THEN** enthält `ENVSUBST_VARS` den Eintrag `RECOVER_DOMAIN`

#### Scenario: backup-restore.sh rendert recovery-browser.yaml durch envsubst *(BATS)*
- **GIVEN** `scripts/backup-restore.sh` enthält den `browse`-Subcommand
- **WHEN** der Skript-Quelltext auf `envsubst`-Nutzung geprüft wird
- **THEN** ist `envsubst` im Skript vorhanden; der Raw-Apply-Ausdruck `$KC apply -n "$NS" -f "$MANIFEST"` ist **nicht** vorhanden

#### Scenario: recovery-browser.yaml behält `${RECOVER_DOMAIN}`-Platzhalter *(BATS)*
- **GIVEN** `k3d/recovery-browser.yaml` ist vorhanden
- **WHEN** das Manifest auf den Host-Platzhalter geprüft wird
- **THEN** enthält es `host: ${RECOVER_DOMAIN}` (Non-Regression: Platzhalter darf nicht entfernt werden)

---

### Requirement: shared-db postStart Self-Heal
<!-- bats: shared-db-initdb-selfheal.bats -->

The system SHALL idempotently ensure every service role AND database exists on each `shared-db` pod start via the postStart hook, so that a partial/failed initdb self-heals on the next restart instead of leaving services crash-looping.

#### Scenario: shared-db.yaml Manifest existiert *(BATS)*
- **GIVEN** das Repository ist ausgecheckt
- **WHEN** nach `k3d/shared-db.yaml` gesucht wird
- **THEN** existiert die Datei

#### Scenario: postStart-Hook erstellt alle Service-Datenbanken idempotent *(BATS)*
- **GIVEN** `k3d/shared-db.yaml` enthält einen postStart-Lifecycle-Hook
- **WHEN** der Hook auf CREATE-DATABASE-Schleife geprüft wird
- **THEN** enthält der Hook `for db in keycloak nextcloud vaultwarden website pentest videovault; do` und `CREATE DATABASE`

#### Scenario: postStart-Hook erstellt alle Service-Rollen via CREATE USER … NOT EXISTS *(BATS)*
- **GIVEN** `k3d/shared-db.yaml` enthält den postStart-Hook
- **WHEN** der Hook auf Rollen-Erstellung für alle Services geprüft wird
- **THEN** enthält der Hook für jede Rolle (`keycloak`, `nextcloud`, `vaultwarden`, `website`, `pentest`) eine `NOT EXISTS`-Prüfung vor `CREATE USER`

#### Scenario: DB-Existenzprüfung geht der CREATE DATABASE voran (Idempotenz) *(BATS)*
- **GIVEN** `k3d/shared-db.yaml` enthält den postStart-Hook
- **WHEN** der Hook auf bedingte Ausführung geprüft wird
- **THEN** ist `SELECT 1 FROM pg_database WHERE datname='$db'` im Manifest vorhanden, sodass ein bereits existierendes Datenbank-Create übersprungen wird

---

### Requirement: Admin Backup API — Authentifizierungsschutz
<!-- e2e: fa-admin-backup-ops.spec.ts -->

The system SHALL require authentication for all `/api/admin/ops/backup/*` endpoints and SHALL reject unauthenticated requests with 401, 403, or 302; it SHALL never return 200 or 500 to unauthenticated callers.

#### Scenario: GET /api/admin/ops/backup/list gibt 401 ohne Auth zurück *(E2E)*
- **GIVEN** kein Authentifizierungs-Cookie oder -Token ist gesetzt
- **WHEN** `GET /api/admin/ops/backup/list` aufgerufen wird
- **THEN** antwortet der Endpunkt mit 401, 403 oder 302; niemals mit 200 oder 500

#### Scenario: POST /api/admin/ops/backup/trigger gibt 401 ohne Auth zurück *(E2E)*
- **GIVEN** kein Authentifizierungs-Cookie oder -Token ist gesetzt
- **WHEN** `POST /api/admin/ops/backup/trigger` mit `{ cluster: 'mentolder' }` aufgerufen wird
- **THEN** antwortet der Endpunkt mit 401, 403 oder 302; niemals mit 200 oder 500

#### Scenario: GET /api/admin/ops/backup/list mit ungültigem Cluster gibt keinen Info-Leak zurück *(E2E)*
- **GIVEN** kein Authentifizierungs-Cookie ist gesetzt und `cluster=INVALID_CLUSTER` ist im Query-String
- **WHEN** `GET /api/admin/ops/backup/list?cluster=INVALID_CLUSTER` aufgerufen wird
- **THEN** antwortet der Endpunkt weder mit 200 noch mit 500

#### Scenario: POST /api/admin/ops/backup/trigger mit ungültigem Cluster-Body wird sicher abgelehnt *(E2E)*
- **GIVEN** kein Authentifizierungs-Cookie ist gesetzt
- **WHEN** `POST /api/admin/ops/backup/trigger` mit `{ cluster: 'INVALID_CLUSTER' }` aufgerufen wird
- **THEN** antwortet der Endpunkt weder mit 200 noch mit 500

#### Scenario: POST /api/admin/ops/backup/trigger mit leerem Body löst keinen Backup-Job aus *(E2E)*
- **GIVEN** kein Authentifizierungs-Cookie ist gesetzt
- **WHEN** `POST /api/admin/ops/backup/trigger` mit leerem Body `{}` aufgerufen wird
- **THEN** antwortet der Endpunkt weder mit 200 noch mit 500 (kein korrupter Backup-Job darf entstehen)

---

### Requirement: Admin Backup Settings — Authentifizierungsschutz
<!-- e2e: fa-admin-backup-settings.spec.ts -->

The system SHALL redirect unauthenticated users away from the backup settings page and SHALL reject unauthenticated POST requests to the backup settings API with 401 or 403.

#### Scenario: /admin/einstellungen/backup leitet unauthentifizierte Nutzer weiter *(E2E)*
- **GIVEN** kein aktiver Authentifizierungs-Cookie ist gesetzt
- **WHEN** die Seite `/admin/einstellungen/backup` im Browser aufgerufen wird
- **THEN** wird der Nutzer auf eine andere URL weitergeleitet (nicht auf der Backup-Settings-Seite verbleibend)

#### Scenario: POST /api/admin/einstellungen/backup gibt 401 oder 403 ohne Auth zurück *(E2E)*
- **GIVEN** kein Authentifizierungs-Cookie ist gesetzt
- **WHEN** `POST /api/admin/einstellungen/backup` mit `{ filen_upload_path: '/test' }` aufgerufen wird
- **THEN** antwortet der Endpunkt mit 401 oder 403

---

### Requirement: Backup-Admin-Endpunkt vorhanden und geschützt
<!-- e2e: sa-07-backup.spec.ts -->

The system SHALL expose a `/api/admin/backup` endpoint that rejects unauthenticated calls with 401, 403, 404, or 405, and SHALL never return 200 without authentication or produce a 500 error.

#### Scenario: POST /api/admin/backup ist vorhanden und gibt ohne Auth keinen Erfolg zurück *(E2E)*
- **GIVEN** kein Authentifizierungs-Cookie ist gesetzt
- **WHEN** `POST /api/admin/backup` mit leerem Body aufgerufen wird
- **THEN** antwortet der Endpunkt mit 401, 403, 404 oder 405; niemals mit 200 (Sicherheitslücke) oder 500 (Server-Fehler)

#### Scenario: Website-API ist grundsätzlich erreichbar *(E2E)*
- **GIVEN** die Website läuft unter `WEBSITE_URL` oder `http://localhost:4321`
- **WHEN** `GET /` mit bis zu 3 Weiterleitungen aufgerufen wird
- **THEN** antwortet die API mit 200, 301, 302 oder 303

<!-- merged from change delta backup-pipeline.md (33d6e0cc4ddf) -->