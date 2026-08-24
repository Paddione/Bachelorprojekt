#!/usr/bin/env bats
# tests/spec/monitoring-alerts/backup-recipient-daily-repeat.bats
# SSOT: openspec/specs/monitoring-alerts.md (Email Notification Receiver)
#
# Backup-Warnungen gehen an die Operator-Mailbox (${BACKUP_ALERT_EMAIL}),
# nicht an die öffentliche Brand-Kontaktadresse (${CONTACT_EMAIL}), und ein
# weiterfeuernder Backup-Alert wiederholt sich maximal einmal pro Tag.
# Prüfmodus: Source-Verifikation (Querschnittstest — das Verhalten manifestiert
# sich ausschließlich im gerenderten Manifest; der Render selbst wird im
# Deploy-Pfad envsubst'd und ist hier nicht ausführbar).

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  AM="$REPO/k3d/monitoring/alertmanager-config.yaml"
}

@test "backup child route matches both backup alerts" {
  run grep -A3 'alertname =~ "BackupJobFailed|BackupCronJobStale"' "$AM"
  [ "$status" -eq 0 ]
  [[ "$output" == *"backup-email"* ]]
}

@test "backup route repeats at most once per day" {
  # Positiv-Anker: der Route-Block muss den backup-email Receiver tragen
  run grep -B1 -A2 'receiver: backup-email' "$AM"
  [ "$status" -eq 0 ]
  [[ "$output" == *"repeatInterval: 24h"* ]]
}

@test "backup-email receiver targets the operator mailbox variable" {
  # ${BACKUP_ALERT_EMAIL}, NICHT ${CONTACT_EMAIL} — die Brand-Adresse ist die
  # öffentliche Kontaktseite, nicht der Betreiber.
  run grep -A8 'name: backup-email' "$AM"
  [ "$status" -eq 0 ]
  [[ "$output" == *'${BACKUP_ALERT_EMAIL}'* ]]
  [[ "$output" != *'${CONTACT_EMAIL}'* ]]
}

@test "BACKUP_ALERT_EMAIL is declared in schema and set in every non-dev env" {
  local schema="$REPO/environments/schema.yaml"
  run grep -A3 'name: BACKUP_ALERT_EMAIL' "$schema"
  [ "$status" -eq 0 ]
  [[ "$output" == *"required: true"* ]]

  # Positiv-Anker + Abdeckung: alle Nicht-dev-Umgebungen tragen den Wert
  for f in mentolder korczewski fleet-mentolder fleet-korczewski staging; do
    run grep -q 'BACKUP_ALERT_EMAIL: patrick@korczewski.de' \
      "$REPO/environments/$f.yaml"
    [ "$status" -eq 0 ]
  done
}
