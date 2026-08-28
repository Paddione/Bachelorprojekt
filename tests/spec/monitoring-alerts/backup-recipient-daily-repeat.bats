#!/usr/bin/env bats
# tests/spec/monitoring-alerts/backup-recipient-daily-repeat.bats
# SSOT: openspec/specs/monitoring-alerts.md (Blackhole Receiver)
#
# T016592 hat alle ausgehenden Benachrichtigungs-E-Mails abgeschaltet. Damit
# sind die frueheren Guards dieser Datei gegenstandslos geworden: der
# backup-email-Receiver, die BackupJobFailed/BackupCronJobStale-Kindroute und
# das repeatInterval: 24h existieren nicht mehr — die Requirement "Email
# Notification Receiver", die sie absicherten, wurde entfernt.
#
# Was bleibt: ${BACKUP_ALERT_EMAIL} ist weiterhin im Schema deklariert und in
# allen Nicht-dev-Umgebungen gesetzt, damit ein Wiedereinschalten der
# Alarmierung keinen Schema-Eingriff braucht. Genau das prueft dieser Test.
# Pruefmodus: Source-Verifikation (Querschnittstest — das Verhalten
# manifestiert sich ausschliesslich in den Konfigurationsdateien).

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  AM="$REPO/k3d/monitoring/alertmanager-config.yaml"
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

@test "the alertmanager config no longer routes backup alerts to a mailbox" {
  # Gegenprobe zum Test oben: die Variable bleibt deklariert, wird aber
  # nirgends mehr im Alertmanager verdrahtet. Nur nicht kommentierte Zeilen —
  # der Erklaerblock im Manifest nennt die entfallene Variable absichtlich.
  run grep -vE '^\s*#' "$AM"
  [ "$status" -eq 0 ]
  [[ "$output" != *"BACKUP_ALERT_EMAIL"* ]]

  # Positiv-Anker: die Datei existiert und traegt weiterhin eine Route.
  run grep -q '^  route:' "$AM"
  [ "$status" -eq 0 ]
}
