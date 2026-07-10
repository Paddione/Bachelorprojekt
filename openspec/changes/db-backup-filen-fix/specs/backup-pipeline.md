## ADDED Requirements

Diese Delta-Spec ergänzt die SSOT `openspec/specs/backup-pipeline.md` um drei
weitere Requirements, die aus dem T001738-Vorfall (3 aufeinanderfolgende
fehlgeschlagene `db-backup`-CronJob-Läufe) abgeleitet sind. Der bestehende
„Optionaler Remote-Upload zu Filen Cloud"-Abschnitt bleibt unverändert; die
folgenden Requirements sind additiv.

### Requirement: Erste-Fail-Alert für db-backup

The system SHALL raise an Alertmanager alert named `DBBackupJobFailed` within
1 minute of the first failed `db-backup` CronJob execution in namespace
`workspace`, routed through the existing `AlertmanagerConfig` to the
`email` and `pushover` receivers with severity `warning`, so that operators
are notified before `failedJobsHistoryLimit: 3` makes the failure visible in
the default `kubectl get jobs` view.

#### Scenario: Alert feuert beim ersten Fehlschlag

- **GIVEN** the `DBBackupJobFailed` Prometheus rule is deployed in namespace `monitoring`
- **WHEN** the `db-backup-<schedule-time>` Job's pod transitions to `BackoffLimitExceeded` in namespace `workspace`
- **THEN** within 1 minute the Alertmanager fires `DBBackupJobFailed{severity="warning", namespace="workspace"}` and Pushover receives a notification titled `db-backup failed`

#### Scenario: Alert bleibt stumm bei Erfolg

- **GIVEN** the `DBBackupJobFailed` Prometheus rule is deployed
- **WHEN** a `db-backup-<schedule-time>` Job completes successfully (`status.succeeded == 1`, `Filen upload done` in container logs)
- **THEN** no `DBBackupJobFailed` alert is active

### Requirement: Manueller Diagnose-Trigger für db-backup

The system SHALL provide a `scripts/db-backup-trigger.sh` operator script that
creates a one-off `Job` from the `db-backup` CronJob template in namespace
`workspace`, tails both container logs (`backup`, `filen-upload`) until the
Job terminates, and exits with code 0 only when the log line `Filen upload done`
appears in the `filen-upload` container output; otherwise it exits 1 with the
captured error.

#### Scenario: Skript bestätigt gesunde Pipeline

- **GIVEN** the `db-backup` CronJob is deployed in namespace `workspace` and Filen credentials are valid
- **WHEN** an operator runs `bash scripts/db-backup-trigger.sh` from the repository root with `kubectl` context `fleet`
- **THEN** a Job `db-backup-diag-<epoch>` is created, both container logs are printed within 10 minutes, the script prints `Filen upload done`, and exits with code 0

#### Scenario: Skript bricht ab bei Upload-Fehler

- **GIVEN** Filen credentials are invalid (simulated by setting `FILEN_EMAIL` to an empty value via a temporary `Secret` patch, or by waiting for a known outage)
- **WHEN** `bash scripts/db-backup-trigger.sh` is run
- **THEN** the script exits with code 1 and prints the `filen-upload` container's last 50 log lines including the `ERROR: Filen remote upload failed` marker

#### Scenario: Skript weigert sich außerhalb des fleet-Kontexts

- **GIVEN** the active `kubectl` context is not `fleet`
- **WHEN** `bash scripts/db-backup-trigger.sh` is run
- **THEN** the script exits with code 1 and prints `FATAL: this script requires kubectl context 'fleet' (active: <name>)` before any Job is created

### Requirement: Dokumentierte Filen Fail-Modes

The project documentation (`CLAUDE.md` or a dedicated `incident-response`-style
runbook) SHALL list the four known Filen-related failure modes for the
`db-backup` CronJob with the corresponding remediation step for each, so that
on-call operators can resolve the issue without reverse-engineering the
container's error output.

#### Scenario: Vier Fail-Modes sind dokumentiert

- **GIVEN** `CLAUDE.md` is updated with the section `## Runbook: db-backup Filen Fail-Modes`
- **WHEN** an operator greps for the section header
- **THEN** the file contains at least the following labeled subsections:
  - `### 2FA auf Filen-Account aktiviert` — remediation: 2FA deaktivieren oder Pipeline auf API-Token migrieren
  - `### Filen-Passwort rotiert` — remediation: `environments/.secrets/<brand>.yaml` anpassen, `task env:seal ENV=<brand>`, `task env:deploy ENV=<brand>`
  - `### Filen-API-Outage / Rate-Limit` — remediation: nichts tun, nächsten Lauf abwarten
  - `### @filen/cli npm-Package gebrochen` — remediation: Image-Pin in `k3d/backup-cronjob.yaml` zurückrollen, separates Backlog-Ticket für API-Token-Migration

#### Scenario: Runbook ist vom Alert aus verlinkt

- **GIVEN** the `DBBackupJobFailed` Prometheus rule is deployed with the `runbook_url` annotation pointing to the runbook section
- **WHEN** an operator clicks the Pushover or e-mail alert notification
- **THEN** the runbook URL in the alert annotation resolves to a `CLAUDE.md` heading anchor for `## Runbook: db-backup Filen Fail-Modes`
