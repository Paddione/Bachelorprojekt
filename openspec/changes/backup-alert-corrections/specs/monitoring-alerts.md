## MODIFIED Requirements

### Requirement: Mandatory Alert Set

The system SHALL declare exactly the 11 mandatory alert rules: `PodCrashLoopBackOff`,
`HighCPUUsage`, `HighMemoryUsage`, `HighDiskUsage`, `High5xxErrorRate`, `PodRestartSpike`,
`NodeHighCPUUsage`, `NodeFilesystemAlmostFull`, `BackupJobFailed`, `BackupCronJobStale`, and
`RestoreVerifyStale`.

#### Scenario: Alle Pflicht-Alerts deklariert *(BATS)*

- **GIVEN** die Datei `k3d/monitoring/prometheus-rules.yaml` existiert
- **WHEN** der Inhalt auf alle 11 `alert:` Einträge geprüft wird
- **THEN** sind alle elf Pflicht-Alerts vorhanden

### Requirement: Backup-Job-Failures lösen kritischen Alert aus

Every failed Kubernetes Job created by a backup CronJob (`pvc-backup`, `db-backup`,
`db-restore-verify`) in namespace `workspace` or `workspace-korczewski` SHALL raise a Prometheus
alert `BackupJobFailed` with label `severity: critical`.

The expression SHALL use `max_over_time` and SHALL NOT use `increase`. `kube_job_status_failed`
carries a `reason` label; a Job that fails within seconds produces a series that is already
constant at its first sample, so `increase()` over it evaluates to `0` and the alert stays
silent. The expression SHALL further restrict to Jobs created within the lookback window via
`kube_job_created` — without that gate, long-lived failed Job objects keep firing (measured on
the fleet cluster: 80 series without the gate, 4 with it).

#### Scenario: Job fails within seconds

- **GIVEN** a backup Job that exhausts its `backoffLimit` in seconds
- **AND** its `kube_job_status_failed` series is constant from the first scrape
- **WHEN** the alert expression is evaluated
- **THEN** `BackupJobFailed` fires, because `max_over_time` does not depend on an observed
  increase

#### Scenario: Old failed Job objects do not keep firing

- **GIVEN** a failed backup Job object older than the lookback window
- **WHEN** the alert expression is evaluated
- **THEN** no alert fires for it, because the `kube_job_created` gate excludes it
  (Positiv-Anker: a Job that failed within the window does fire)

### Requirement: Ausgebliebene Backup-Erfolge lösen Stale-Alert aus

Each DAILY backup CronJob (`pvc-backup`, `db-backup`) in namespace `workspace` or
`workspace-korczewski` SHALL raise `BackupCronJobStale` with `severity: critical` when its last
successful run is older than 26 hours, or when no successful run has ever been recorded. The
expression SHALL use `kube_cronjob_status_last_successful_time` and SHALL NOT use
`kube_cronjob_status_last_schedule_time`.

The never-succeeded branch SHALL be gated on CronJob age via `kube_cronjob_created`, so that a
newly created CronJob is not critical before it has had a chance to run once.

#### Scenario: Nightly run starts but keeps failing

- **GIVEN** a daily backup CronJob whose last successful run is older than 26 hours
- **AND** it is triggered on schedule every night, so its last schedule time is recent
- **WHEN** the alert expression is evaluated
- **THEN** `BackupCronJobStale` fires with `severity: critical`

#### Scenario: Freshly created CronJob stays silent

- **GIVEN** a backup CronJob created less than its own interval ago
- **AND** no `kube_cronjob_status_last_successful_time` series exists for it yet
- **WHEN** the alert expression is evaluated
- **THEN** no alert fires
  (Positiv-Anker: an older CronJob without any successful run does fire)

## ADDED Requirements

### Requirement: Die wöchentliche Restore-Verifikation hat eine eigene Schwelle

The weekly restore verification CronJob `db-restore-verify` (schedule `30 3 * * 0`) SHALL be
covered by its own alert `RestoreVerifyStale` with a threshold of 8 days, not by the 26-hour
threshold of the daily backups. Under the daily threshold the alert would be firing on six of
every seven days.

The alert SHALL reference the CronJob by its real name `db-restore-verify`. The manifest FILE is
named `k3d/backup-restore-verify-cronjob.yaml`, but the CronJob inside it is `db-restore-verify`;
Prometheus label matchers are fully anchored, so a filename-derived name matches nothing and the
capability would silently cover no job at all.

#### Scenario: Weekly job is not flagged between runs

- **GIVEN** `db-restore-verify` succeeded four days ago
- **WHEN** the alert expression is evaluated
- **THEN** no `RestoreVerifyStale` alert fires

#### Scenario: Weekly job misses more than a week

- **GIVEN** the last successful `db-restore-verify` run is older than 8 days
- **AND** the CronJob is not suspended
- **WHEN** the alert expression is evaluated
- **THEN** `RestoreVerifyStale` fires with `severity: warning`

### Requirement: Namespace-Scoping bleibt für andere AlertmanagerConfigs erhalten

The Alertmanager CR SHALL set `spec.alertmanagerConfigMatcherStrategy.type` to
`OnNamespaceExceptForAlertmanagerNamespace`, not to `None`. The `workspace-alerts`
AlertmanagerConfig lives in the Alertmanager's own namespace and is therefore exempted, while
every AlertmanagerConfig in any other namespace keeps its namespace scoping.

`None` would be broader than the problem: the `workspace-alerts` root route declares neither
`matchers` nor `continue`, so without an appended namespace matcher it becomes a cluster-wide
catch-all that swallows every alert and shadows any route appended after it.

#### Scenario: Workspace alerts still reach the email receiver

- **GIVEN** the Alertmanager CR carries
  `alertmanagerConfigMatcherStrategy.type: OnNamespaceExceptForAlertmanagerNamespace`
- **WHEN** `amtool config routes test` is run with `namespace=workspace`
- **THEN** the resolved receiver is the email receiver of `workspace-alerts`, not `null`

#### Scenario: A config in another namespace keeps its scoping

- **GIVEN** an AlertmanagerConfig in a namespace other than the Alertmanager's own
- **WHEN** the operator assembles the routing tree
- **THEN** that config still receives its `namespace` matcher
