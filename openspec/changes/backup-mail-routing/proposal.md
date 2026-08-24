# Proposal: backup-mail-routing

## Why

Backup-Warnungen (`BackupJobFailed`, `BackupCronJobStale`) liefen auf die öffentliche
Brand-Kontaktadresse (`${CONTACT_EMAIL}`) statt an die Operator-Mailbox — Nachzieh aus
T015712/T015741. Zusätzlich wiederholte ein weiterfeuernder Alert alle 4 Stunden statt maximal
einmal pro Tag. Der Fix existierte als ungeticketer Patch im Hauptcheckout
(Session-Ende-Sicherung) und wird mit diesem Change auf einen eigenen Branch gezogen.

_Ticket: T016415_

## What

- **Alertmanager:** neue Child-Route `alertname =~ "BackupJobFailed|BackupCronJobStale"` →
  Receiver `backup-email` mit `repeatInterval: 24h`; der Receiver sendet an
  `${BACKUP_ALERT_EMAIL}`. Route und Receiver sind in beiden Brand-Renders identisch, damit der
  abwechselnd applizierte gemeinsame Ressourcenstand nicht flip-floppt.
- **Environments:** `BACKUP_ALERT_EMAIL` ist im Schema required und in allen fünf Nicht-dev-
  Umgebungen gesetzt (mentolder, korczewski, fleet-mentolder, fleet-korczewski, staging).
- **Deploy-Pfad:** `BACKUP_ALERT_EMAIL` ist in beide `ENVSUBST_VARS`-Abdeckungen aufgenommen
  (`Taskfile.yml`, `scripts/pre-deploy-checks-lib.sh`).
- **Test:** neuer BATS-Querschnittstest
  `tests/spec/monitoring-alerts/backup-recipient-daily-repeat.bats`
  (Source-Verifikation, lokal 4/4 grün am 2026-08-24).

## Impact

Keine Codepfade außerhalb Monitoring/Environments/Deploy-Checks. Nach dem Merge rendert der
Deploy-Pfad die neue Variable in beide Brands; Alertmanager zieht die Config ohne Neustart.
