## ADDED Requirements

### Requirement: Alerts aus den Workspace-Namespaces erreichen einen Empfänger

The Alertmanager CR SHALL set `spec.alertmanagerConfigMatcherStrategy.type` to `None`, so that the
Prometheus Operator does not append a `namespace="monitoring"` matcher to the `workspace-alerts`
AlertmanagerConfig. Without it, every alert originating from `workspace` or `workspace-korczewski`
falls through to the default receiver `null` and is discarded — including all mandatory alerts.

#### Scenario: Routing test resolves to the email receiver

- **GIVEN** the Alertmanager CR carries `alertmanagerConfigMatcherStrategy.type: None`
- **WHEN** `amtool config routes test` is run with labels `namespace=workspace` and
  `alertname=BackupJobFailed`
- **THEN** the resolved receiver is the email receiver of `workspace-alerts`, not `null`

#### Scenario: Patch is registered in the kustomization

- **GIVEN** the file `k3d/monitoring/alertmanager-matcher-strategy-patch.yaml` exists
- **WHEN** `k3d/monitoring/kustomization.yaml` is inspected
- **THEN** its `patches:` list contains `alertmanager-matcher-strategy-patch.yaml`
  (Positiv-Anker: the pre-existing entry `loki-sc-rules-resources-patch.yaml` is still present)

### Requirement: Backup-Job-Failures lösen kritischen Alert aus

Every failed Kubernetes Job created by a backup CronJob (`pvc-backup`, `db-backup`,
`backup-restore-verify`) in namespace `workspace` or `workspace-korczewski` SHALL raise a
Prometheus alert `BackupJobFailed` with label `severity: critical` within the rule evaluation
window, so that a failed nightly run is signaled immediately instead of at the next manual audit.

#### Scenario: Forced failed backup run produces a signal

- **GIVEN** the PrometheusRule `workspace-alerts` contains the group `backup.rules`
- **WHEN** a backup Job in one of the covered namespaces transitions to failed
  (`increase(kube_job_status_failed[12h]) > 0`)
- **THEN** the alert `BackupJobFailed` fires with `severity: critical` and is routed to the email
  receiver of `workspace-alerts`

### Requirement: Ausgebliebene Backup-Erfolge lösen Stale-Alert aus

Each monitored backup CronJob (`pvc-backup`, `db-backup`, `backup-restore-verify`) in namespace
`workspace` or `workspace-korczewski` SHALL raise a Prometheus alert `BackupCronJobStale` with
label `severity: critical` when its last SUCCESSFUL run is older than 26 hours (daily schedule plus
tolerance), or when no successful run has ever been recorded. The expression SHALL use
`kube_cronjob_status_last_successful_time` and SHALL NOT use
`kube_cronjob_status_last_schedule_time`: a CronJob that starts on schedule every night and then
fails keeps the schedule metric fresh and would never alert — which is the exact failure this
capability exists to catch.

#### Scenario: Nightly run starts but keeps failing

- **GIVEN** a backup CronJob whose last successful run is older than 26 hours
- **AND** the CronJob is triggered on schedule every night, so its last schedule time is recent
- **WHEN** the alert expression is evaluated
- **THEN** the alert `BackupCronJobStale` fires with `severity: critical`

#### Scenario: CronJob has never succeeded

- **GIVEN** a monitored backup CronJob for which no `kube_cronjob_status_last_successful_time`
  series exists
- **WHEN** the alert expression is evaluated
- **THEN** the alert `BackupCronJobStale` fires, because the expression covers the missing series
  via an `unless` branch instead of silently producing no result

### Requirement: Suspendierte CronJobs erzeugen keinen Alarm

The `BackupCronJobStale` expression SHALL exclude CronJobs whose `kube_cronjob_spec_suspend` is
`1`. A deliberately suspended backup — such as `workspace-korczewski/db-backup` while that brand is
frozen — has nothing to back up, and a permanently firing alert would devalue the genuine one.

#### Scenario: Suspended CronJob stays silent

- **GIVEN** `workspace-korczewski/db-backup` reports `kube_cronjob_spec_suspend == 1`
- **AND** its last successful run is older than 26 hours
- **WHEN** the alert expression is evaluated
- **THEN** no `BackupCronJobStale` alert fires for that CronJob
  (Positiv-Anker: a non-suspended CronJob with a stale successful run does fire)

### Requirement: Backup-Alerts decken beide Brands ab

The backup alert expressions SHALL match namespaces `workspace` and `workspace-korczewski`
(mentolder and korczewski brands) so that neither brand's backups can fail silently.

#### Scenario: Namespace coverage

- **GIVEN** the `backup.rules` group in `k3d/monitoring/prometheus-rules.yaml`
- **WHEN** the alert expressions are inspected
- **THEN** each expression filters `namespace=~"workspace|workspace-korczewski"`

## MODIFIED Requirements

### Requirement: Mandatory Alert Set

The system SHALL declare exactly the 10 mandatory alert rules: `PodCrashLoopBackOff`,
`HighCPUUsage`, `HighMemoryUsage`, `HighDiskUsage`, `High5xxErrorRate`, `PodRestartSpike`,
`NodeHighCPUUsage`, `NodeFilesystemAlmostFull`, `BackupJobFailed`, and `BackupCronJobStale`.

#### Scenario: Alle Pflicht-Alerts deklariert *(BATS)*

- **GIVEN** die Datei `k3d/monitoring/prometheus-rules.yaml` existiert
- **WHEN** der Inhalt auf alle 10 `alert:` Einträge geprüft wird
- **THEN** sind alle zehn Pflicht-Alerts — `PodCrashLoopBackOff`, `HighCPUUsage`,
  `HighMemoryUsage`, `HighDiskUsage`, `High5xxErrorRate`, `PodRestartSpike`, `NodeHighCPUUsage`,
  `NodeFilesystemAlmostFull`, `BackupJobFailed`, `BackupCronJobStale` — vorhanden
