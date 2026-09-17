# monitoring-alerts Delta

## MODIFIED Requirements

### Requirement: Backup-Job-Failures lösen kritischen Alert aus

Every failed Kubernetes Job created by a backup CronJob (`pvc-backup`, `db-backup`,
`backup-restore-verify`) in namespace `workspace` or `workspace-korczewski` SHALL raise a
Prometheus alert `BackupJobFailed` with label `severity: critical` within the rule evaluation
window, so that a failed nightly run is signaled immediately instead of at the next manual audit.

#### Scenario: Forced failed backup run produces a signal

- **GIVEN** the PrometheusRule `workspace-alerts` contains the group `backup.rules`
- **WHEN** a backup Job in one of the covered namespaces transitions to failed
  (`increase(kube_job_status_failed[12h]) > 0`)
- **THEN** the alert `BackupJobFailed` fires with `severity: critical` and is routed to the
  dedicated `backup-email` receiver of the shared Alertmanager config, not the brand contact
  receiver

## ADDED Requirements

### Requirement: Backup alerts reach the operator mailbox at a daily cadence

Backup alert notifications for `BackupJobFailed` and `BackupCronJobStale` SHALL be delivered to
the operator mailbox `${BACKUP_ALERT_EMAIL}` and never to the public brand contact address
`${CONTACT_EMAIL}`. The Alertmanager config SHALL contain a child route matching
`alertname =~ "BackupJobFailed|BackupCronJobStale"` that targets a dedicated receiver
`backup-email` configured with `repeatInterval: 24h`. The child route and receiver SHALL be
identical in every brand render of `k3d/monitoring/alertmanager-config.yaml`, because both brands
apply the same resource alternately and a divergence would flip-flop the live configuration.

#### Scenario: Repeated failure notifies once per day

- **GIVEN** the Alertmanager config carries the `backup-email` child route with
  `repeatInterval: 24h`
- **WHEN** a `BackupJobFailed` alert keeps firing throughout a day
- **THEN** notifications go to `${BACKUP_ALERT_EMAIL}` at most once per 24-hour interval

#### Scenario: Brand renders do not diverge

- **GIVEN** the rendered Alertmanager config for `mentolder` and for `korczewski`
- **WHEN** the `backup-email` route and receiver blocks are compared between renders
- **THEN** they are identical

#### Scenario: Envsubst coverage includes the new variable

- **GIVEN** the deploy path in `Taskfile.yml` and the pre-deploy check in
  `scripts/pre-deploy-checks-lib.sh`
- **WHEN** either `ENVSUBST_VARS` list is validated against the environment schema
- **THEN** `BACKUP_ALERT_EMAIL` is covered in both lists and required by
  `environments/schema.yaml`
