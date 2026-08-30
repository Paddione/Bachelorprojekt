#!/usr/bin/env bats
# tests/spec/website-core/email-notifications.bats
# SSOT: openspec/specs/website-core.md (notify-unread CronJob ist suspendiert)
#       openspec/specs/monitoring-alerts.md (operator email receiver)
#
# T016592 schaltet alle ausgehenden Benachrichtigungs-E-Mails ab. Die drei
# manifest-getragenen Anteile werden hier abgesichert: der suspendierte
# notify-unread-CronJob, der Alertmanager-Operator-Receiver und die
# Registrierung des Nextcloud-occ-Jobs.
#
# Prüfmodus: Source-Verifikation (Querschnittstest — das Verhalten manifestiert
# sich ausschließlich im gerenderten Manifest; der Render selbst wird im
# Deploy-Pfad envsubst'd und ist hier nicht ausführbar). Gleiche Begründung wie
# tests/spec/monitoring-alerts/backup-recipient-daily-repeat.bats.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  CRON="$REPO/k3d/notify-unread-cronjob.yaml"
  AM="$REPO/k3d/monitoring/alertmanager-config.yaml"
  KUST="$REPO/k3d/kustomization.yaml"
  NCJOB="$REPO/k3d/nextcloud-notification-config-job.yaml"
}

@test "notify-unread CronJob ist suspendiert" {
  run grep -E '^  suspend: true' "$CRON"
  [ "$status" -eq 0 ]
}

@test "notify-unread CronJob bleibt in der kustomization registriert" {
  # Positiv-Anker: die Abschaltung entfernt das Manifest NICHT, sie legt nur
  # ein Feld um — sonst wäre das Wiedereinschalten ein Manifest-Neubau.
  run grep -F 'notify-unread-cronjob.yaml' "$KUST"
  [ "$status" -eq 0 ]
}

@test "alertmanager-config deklariert den Operator-Receiver" {
  run grep -E '^    - name: operator-email' "$AM"
  [ "$status" -eq 0 ]
}

@test "alertmanager-config routet auf den Operator-Receiver" {
  run grep -E '^    receiver: operator-email' "$AM"
  [ "$status" -eq 0 ]
}

@test "alertmanager-config traegt die autorisierte E-Mail-Konfiguration" {
  run grep -F 'emailConfigs:' "$AM"
  [ "$status" -eq 0 ]
  run grep -F 'to: korczewski@mailbox.org' "$AM"
  [ "$status" -eq 0 ]

  run grep -E '^  receivers:' "$AM"
  [ "$status" -eq 0 ]
}

@test "alertmanager-config traegt keine backup-email-Kindroute mehr" {
  # Nur nicht kommentierte Zeilen — der Erklaerblock im Manifest nennt den
  # entfallenen Receiver absichtlich beim Namen. Gleiche Lesart wie die
  # Requirement "Brand-Neutral Alertmanager Config".
  run grep -vE '^\s*#' "$AM"
  [ "$status" -eq 0 ]
  [[ "$output" != *"backup-email"* ]]
}

@test "nextcloud-notification-config-Job existiert und ist ein batch/v1 Job" {
  [ -f "$NCJOB" ]

  run grep -E '^kind: Job' "$NCJOB"
  [ "$status" -eq 0 ]
}

@test "nextcloud-notification-config-Job ist in der kustomization registriert" {
  run grep -F 'nextcloud-notification-config-job.yaml' "$KUST"
  [ "$status" -eq 0 ]
}
