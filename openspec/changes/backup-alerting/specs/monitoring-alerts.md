## ADDED Requirements

### Requirement: Backup-Job-Failures lösen kritischen Alert aus

Every failed Kubernetes Job created by a backup CronJob (`pvc-backup`, `db-backup`,
`backup-restore-verify`) in namespace `workspace` or `workspace-korczewski` SHALL raise a
Prometheus alert `BackupJobFailed` with label `severity: critical` within the rule evaluation
window, so that a failed nightly run is signaled immediately instead of at the next manual audit.

#### Scenario: Forced failed backup run produces a signal

- **GIVEN** the PrometheusRule `workspace-alerts` contains the group `backup.rules`
- **WHEN** a backup Job in one of the covered namespaces transitions to failed
  (`increase(kube_job_status_failed[12h]) > 0`)
- **THEN** the alert `BackupJobFailed` fires with `severity: critical` and is delivered through
  the existing Alertmanager receivers (Pushover and email)

### Requirement: Ausgebliebene Backup-Läufe lösen Stale-Alert aus

Each monitored backup CronJob (`pvc-backup`, `db-backup`, `backup-restore-verify`) in namespace
`workspace` or `workspace-korczewski` SHALL raise a Prometheus alert `BackupCronJobStale` when its
`kube_cronjob_status_last_schedule_time` is older than 26 hours (daily schedule plus tolerance),
so that silently suspended or never-scheduled backups are detected.

#### Scenario: CronJob misses its nightly schedule

- **GIVEN** the daily backup CronJob has not been scheduled for more than 26 hours
- **WHEN** the expression `time() - kube_cronjob_status_last_schedule_time > 93600` evaluates true
- **THEN** the alert `BackupCronJobStale` fires with `severity: warning`

### Requirement: Backup-Alerts decken beide Brands ab

The backup alert expressions SHALL match namespaces `workspace` and `workspace-korczewski`
(mentolder and korczewski brands) so that neither brand's backups can fail silently.

#### Scenario: Namespace coverage

- **GIVEN** the `backup.rules` group in `k3d/monitoring/prometheus-rules.yaml`
- **WHEN** the alert expressions are inspected
- **THEN** each expression filters `namespace=~"workspace|workspace-korczewski"`
