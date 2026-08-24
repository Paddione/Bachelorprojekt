#!/usr/bin/env bats
# tests/spec/monitoring-alerts/backup-alerting.bats
# SSOT: openspec/specs/monitoring-alerts.md
#
# Covers: backup.rules alert group and the Alertmanager routing fix that makes
# alerts from the workspace namespaces reach a receiver at all. [T015712]

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  RULES="$REPO/k3d/monitoring/prometheus-rules.yaml"
  KUSTOMIZATION="$REPO/k3d/monitoring/kustomization.yaml"
  PATCH="$REPO/k3d/monitoring/alertmanager-matcher-strategy-patch.yaml"
}

# ── Alert group ───────────────────────────────────────────────────────

@test "prometheus-rules.yaml declares the backup.rules group" {
  run grep -q 'name: backup.rules' "$RULES"
  [ "$status" -eq 0 ]
}

@test "prometheus-rules.yaml declares BackupJobFailed with severity critical" {
  run grep -A6 'alert: BackupJobFailed' "$RULES"
  [ "$status" -eq 0 ]
  [[ "$output" == *"kube_job_status_failed"* ]]
  [[ "$output" == *"severity: critical"* ]]
}

@test "BackupJobFailed covers both brand namespaces" {
  run grep -A3 'alert: BackupJobFailed' "$RULES"
  [ "$status" -eq 0 ]
  [[ "$output" == *'namespace=~"workspace|workspace-korczewski"'* ]]
}

# ── The metric that actually detects the failure ──────────────────────
#
# A CronJob that starts on schedule every night and then fails keeps
# last_schedule_time fresh and would never alert — that is the exact failure
# this capability exists to catch. Measured on the fleet cluster 2026-08-24:
# the last_schedule_time expression fired for the SUSPENDED korczewski
# db-backup and stayed silent on korczewski/pvc-backup, which had not
# succeeded in 17 days.

@test "BackupCronJobStale uses last_successful_time, not last_schedule_time" {
  run grep -A14 'alert: BackupCronJobStale' "$RULES"
  [ "$status" -eq 0 ]
  [[ "$output" == *"kube_cronjob_status_last_successful_time"* ]]
  [[ "$output" != *"kube_cronjob_status_last_schedule_time"* ]]
}

@test "BackupCronJobStale excludes suspended CronJobs" {
  run grep -A14 'alert: BackupCronJobStale' "$RULES"
  [ "$status" -eq 0 ]
  [[ "$output" == *"kube_cronjob_spec_suspend"* ]]
}

@test "BackupCronJobStale covers CronJobs that never succeeded" {
  run grep -A14 'alert: BackupCronJobStale' "$RULES"
  [ "$status" -eq 0 ]
  [[ "$output" == *"unless"* ]]
}

# ── Routing fix ───────────────────────────────────────────────────────
#
# Without this the Prometheus Operator appends namespace="monitoring" to the
# workspace-alerts AlertmanagerConfig and every workspace* alert falls through
# to the default receiver "null".

@test "alertmanager matcher-strategy patch exists and disables the namespace matcher" {
  [ -f "$PATCH" ]
  run grep -A2 'alertmanagerConfigMatcherStrategy' "$PATCH"
  [ "$status" -eq 0 ]
  [[ "$output" == *"type: None"* ]]
}

@test "matcher-strategy patch targets the Alertmanager CR" {
  run cat "$PATCH"
  [ "$status" -eq 0 ]
  [[ "$output" == *"kind: Alertmanager"* ]]
  [[ "$output" == *"name: monitoring-alertmanager"* ]]
}

@test "kustomization registers the matcher-strategy patch" {
  run grep -A4 '^patches:' "$KUSTOMIZATION"
  [ "$status" -eq 0 ]
  [[ "$output" == *"alertmanager-matcher-strategy-patch.yaml"* ]]
  # Positiv-Anker: der vorbestehende Patch-Eintrag bleibt erhalten
  [[ "$output" == *"loki-sc-rules-resources-patch.yaml"* ]]
}
