# monitoring-alerts
<!-- baseline SSOT — generiert aus Codebase-Analyse am 2026-06-20 -->

## Purpose

Das Monitoring-Alerting-System definiert Prometheus-Alertregeln und Alertmanager-Konfiguration für die Workspace-Plattform. Es stellt sicher, dass kritische Cluster-Ereignisse (Pod-Crashes, hohe Ressourcenauslastung, Fehlerraten) zuverlässig erkannt und über Pushover sowie E-Mail benachrichtigt werden. Die Konfiguration ist markenunabhängig und muss für alle Cluster-Umgebungen valide bauen.

---

## Requirements

### Requirement: No Unregistered Resource Manifests in k3d/monitoring

Every YAML file under `k3d/monitoring/` that declares a Kubernetes resource (i.e. contains a top-level
`kind:` field) SHALL be listed as a `resource` entry in `k3d/monitoring/kustomization.yaml`. A manifest
that is not referenced there is never built or applied, and SHALL NOT exist in the directory.

#### Scenario: All monitoring manifests are referenced by the kustomization

- **GIVEN** the file list under `k3d/monitoring/*.yaml`
- **WHEN** each file containing a `kind:` field is cross-checked against the `resources:` list in
  `k3d/monitoring/kustomization.yaml`
- **THEN** every such file appears in that `resources:` list

### Requirement: Placeholder CronJobs Are Not Committed

No `CronJob` manifest under `k3d/` SHALL ship with a container `command` that is a literal placeholder
(e.g. an `echo` string with no measurement or side effect). If a CronJob's job is not yet implemented, it
SHALL NOT be committed until it performs real work, or the responsibility SHALL be documented as owned by
an existing mechanism (e.g. a GitHub Actions workflow) instead of a redundant in-cluster stub.

#### Scenario: health-goals-cronjob.yaml no longer exists as a dead placeholder

- **GIVEN** the repository at `k3d/monitoring/`
- **WHEN** the directory listing is checked for `health-goals-cronjob.yaml`
- **THEN** the file does not exist, because the health-goals measurement responsibility is fully owned by
  `.github/workflows/health-goals.yml` (`task health:goals:update` / `scripts/health-goals-check.sh`)

### Requirement: Monitoring-Hauptcontainer haben Resource Requests und Limits

Der Prod-Patch `prod/monitoring/resource-limits-patch.yaml` MUSS über den bestehenden
Grafana-Block hinaus folgende Workloads mit `resources.requests` (cpu, memory) und
`resources.limits` (cpu, memory) versorgen:

- Deployment `monitoring-grafana`: Sidecar-Container `grafana-sc-dashboard` und
  `grafana-sc-datasources` (strategic merge ergänzt Listeneinträge per Container-Namen)
- DaemonSet `monitoring-prometheus-node-exporter`: Container `node-exporter`
  (Achtung: eigener `kind: DaemonSet`-Patch, nicht Deployment)
- Deployment `monitoring-kube-state-metrics`: Hauptcontainer
- Deployment `monitoring-operator`: Container `kube-prometheus-stack`

Die Werte folgen der Größenordnung der bestehenden Blöcke in
`k3d/monitoring/values/kube-prometheus-stack-prod-values.yaml`.

#### Scenario: Patch deckt alle Hauptcontainer ab

- **GIVEN** die Datei `prod/monitoring/resource-limits-patch.yaml`
- **WHEN** die deklarierten Patches geprüft werden
- **THEN** existieren Einträge für grafana-sidecars (grafana-sc-dashboard,
  grafana-sc-datasources), node-exporter (DaemonSet), kube-state-metrics und den
  operator (kube-prometheus-stack), jeweils mit requests und limits

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

## Testszenarien

<!-- merged from BATS unit tests and Playwright e2e tests -->

### Requirement: Prometheus Rules File Existence
<!-- bats: T000617-alert-rules.bats -->

The system SHALL provide a Prometheus rules manifest at `k3d/monitoring/prometheus-rules.yaml`.

#### Scenario: Regeldatei vorhanden *(BATS)*
- **GIVEN** das Repository ist ausgecheckt
- **WHEN** der Pfad `k3d/monitoring/prometheus-rules.yaml` geprüft wird
- **THEN** existiert die Datei im Dateisystem

---

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

### Requirement: Prometheus Rules Validity
<!-- bats: T000617-alert-rules.bats -->

The system SHALL produce a syntactically and semantically valid Prometheus rule file that passes `promtool check rules` without errors.

#### Scenario: Valide Prometheus-Regelstruktur *(BATS)*
- **GIVEN** `promtool` und `yq` sind installiert und `k3d/monitoring/prometheus-rules.yaml` existiert
- **WHEN** der `.spec`-Block der YAML-Datei extrahiert und mit `promtool check rules` validiert wird
- **THEN** endet `promtool` mit Exit-Code 0 ohne Fehlerausgabe

#### Scenario: Kein promtool — Test überspringen *(BATS)*
- **GIVEN** `promtool` oder `yq` ist nicht installiert (Offline-Umgebung)
- **WHEN** der Validierungstest ausgeführt wird
- **THEN** wird der Test mit `skip` übersprungen, ohne als Fehler gewertet zu werden

---

### Requirement: Pushover Notification Receiver

The Alertmanager configuration at `k3d/monitoring/alertmanager-config.yaml` SHALL NOT declare a
Pushover receiver while `PUSHOVER_USER` / `PUSHOVER_TOKEN` are empty in `environments/*.yaml`,
because the Prometheus Operator rejects the complete AlertmanagerConfig otherwise
(`mandatory field userKey is empty`) — taking the email route down with it. The receiver SHALL be
(re-)introduced only together with a sealed `alertmanager-pushover` Secret containing non-empty
values for both keys. Email remains the active routing channel in the meantime.

#### Scenario: Kein Pushover-Receiver ohne Credentials *(BATS)*

- **GIVEN** die Datei `k3d/monitoring/alertmanager-config.yaml` existiert und `environments/mentolder.yaml`
  enthält `PUSHOVER_TOKEN: ""` sowie `PUSHOVER_USER: ""`
- **WHEN** der Inhalt der Datei auf Receiver-Konfigurationen geprüft wird
- **THEN** enthält die Datei einen Eintrag `emailConfigs:` (Positiv-Anker: E-Mail-Routing aktiv)
  und keinen Eintrag `pushoverConfigs:`

#### Scenario: Wiedereinführung nur mit gesealten Credentials

- **GIVEN** `PUSHOVER_USER` und `PUSHOVER_TOKEN` sind mit nicht-leeren Werten in den
  Environment-Files gepflegt und über `env-seal.sh` in `alertmanager-pushover-secret.yaml` gesealt
- **WHEN** die Alertmanager-Konfiguration gebaut und angewendet wird
- **THEN** akzeptiert der Prometheus Operator die Config inklusive Pushover-Receivers

### Requirement: Email Notification Receiver
<!-- bats: T000617-alert-rules.bats -->

The system SHALL configure an email receiver in the Alertmanager configuration at `k3d/monitoring/alertmanager-config.yaml`.

#### Scenario: E-Mail-Empfänger konfiguriert *(BATS)*
- **GIVEN** die Datei `k3d/monitoring/alertmanager-config.yaml` existiert
- **WHEN** der Inhalt auf Receiver-Konfigurationen geprüft wird
- **THEN** enthält die Datei mindestens einen Eintrag `emailConfigs:`

---

### Requirement: Brand-Neutral Alertmanager Config
<!-- bats: T000617-alert-rules.bats -->

The system SHALL NOT hardcode any brand domain (`mentolder.de` or `korczewski.de`) in the Alertmanager configuration outside of comments.

#### Scenario: Keine hardcodierten Markennamen *(BATS)*
- **GIVEN** die Datei `k3d/monitoring/alertmanager-config.yaml` existiert
- **WHEN** alle nicht kommentierten Zeilen auf `mentolder.de` oder `korczewski.de` geprüft werden
- **THEN** werden keine Treffer gefunden, sodass dieselbe Konfiguration für alle Marken-Umgebungen gilt

---

### Requirement: Monitoring Kustomize Build
<!-- bats: T000617-alert-rules.bats -->

The system SHALL produce a valid Kubernetes manifest set when `kubectl kustomize k3d/monitoring/` is executed.

#### Scenario: Kustomize-Build erfolgreich *(BATS)*
- **GIVEN** die Verzeichnisstruktur `k3d/monitoring/` mit `kustomization.yaml` existiert
- **WHEN** `kubectl kustomize k3d/monitoring/ --load-restrictor=LoadRestrictionsNone` ausgeführt wird
- **THEN** endet der Befehl mit Exit-Code 0 und gibt valide YAML-Manifeste aus

---

### Requirement: Admin Monitoring Page Authentication
<!-- e2e: fa-admin-monitoring.spec.ts -->

The system SHALL require authentication to access the admin monitoring page and its API.

#### Scenario: Unauthenticated redirect from /admin/monitoring *(E2E)*
- **GIVEN** kein Benutzer ist eingeloggt
- **WHEN** `/admin/monitoring` im Browser aufgerufen wird
- **THEN** wird der Benutzer auf eine andere URL weitergeleitet (nicht auf `/admin/monitoring` verbleibend)

#### Scenario: /api/admin/monitoring ohne Auth abgewiesen *(E2E)*
- **GIVEN** kein Authentifizierungs-Token ist vorhanden
- **WHEN** `GET /api/admin/monitoring` aufgerufen wird
- **THEN** antwortet der Server mit HTTP 401 oder 403

---

### Requirement: Ops Health API — Single-Cluster Scope
<!-- e2e: fa-44-platform-health-integrity.spec.ts -->

The system SHALL ensure the health API reports only the current cluster's services and requires authentication.

#### Scenario: /api/admin/ops/health erfordert Authentifizierung *(E2E)*
- **GIVEN** kein Authentifizierungs-Token ist vorhanden
- **WHEN** `GET /api/admin/ops/health` aufgerufen wird
- **THEN** antwortet der Server mit HTTP 401 oder 403

#### Scenario: Health API liefert nur den eigenen Cluster *(E2E)*
- **GIVEN** ein authentifizierter Admin ist eingeloggt
- **WHEN** `GET /api/admin/ops/health` aufgerufen wird
- **THEN** enthält die Antwort ein `results`-Objekt mit genau einem Cluster-Key (`mentolder` oder `korczewski`), dessen Einträge jeweils `name`, `status` (ok/slow/error/optional) und `slug` besitzen

---

### Requirement: Infrastructure Service Health Sweep
<!-- e2e: nfa-infra-health-sweep.spec.ts -->

The system SHALL expose HTTP health endpoints for all core workspace services that return non-5xx responses.

#### Scenario: Website-Root gibt HTTP 200 zurück *(E2E)*
- **GIVEN** `PROD_DOMAIN` ist gesetzt und der Cluster läuft
- **WHEN** `GET https://web.<domain>/` aufgerufen wird
- **THEN** antwortet der Server mit HTTP 200

#### Scenario: /api/health der Website gibt ok:true zurück *(E2E)*
- **GIVEN** `PROD_DOMAIN` ist gesetzt und der Cluster läuft
- **WHEN** `GET https://web.<domain>/api/health` aufgerufen wird
- **THEN** antwortet der Server mit HTTP 200 und `{ ok: true }` im JSON-Body

#### Scenario: Pocket ID OIDC Discovery erreichbar *(E2E)*
- **GIVEN** `PROD_DOMAIN` ist gesetzt und Pocket ID läuft
- **WHEN** `GET https://auth.<domain>/.well-known/openid-configuration` aufgerufen wird — ohne Realm-Präfix im Pfad
- **THEN** antwortet der Server mit HTTP 200 und ein JSON mit `issuer` und `authorization_endpoint`

#### Scenario: Nextcloud /status.php meldet installed:true *(E2E)*
- **GIVEN** `PROD_DOMAIN` ist gesetzt und Nextcloud läuft
- **WHEN** `GET https://files.<domain>/status.php` aufgerufen wird
- **THEN** antwortet der Server mit HTTP 200 und `{ installed: true }` im JSON-Body

#### Scenario: Collabora /hosting/discovery gibt XML zurück *(E2E)*
- **GIVEN** `PROD_DOMAIN` ist gesetzt und Collabora läuft
- **WHEN** `GET https://office.<domain>/hosting/discovery` aufgerufen wird
- **THEN** antwortet der Server mit HTTP 200 und einem XML- oder Text-Content-Type

#### Scenario: Vaultwarden /alive gibt HTTP 200 zurück *(E2E)*
- **GIVEN** `PROD_DOMAIN` ist gesetzt und Vaultwarden läuft
- **WHEN** `GET https://vault.<domain>/alive` aufgerufen wird
- **THEN** antwortet der Server mit HTTP 200

---

### Requirement: System-Test 9 Walkthrough (Monitoring & Bug-Tracking)
<!-- e2e: systemtest-09-monitoring.spec.ts -->

The system SHALL allow an authenticated admin to walk all 5 steps of System-Test 9 (Monitoring & Bug-Tracking) and submit the form successfully.

#### Scenario: System-Test 9 vollständig durchlaufen *(E2E)*
- **GIVEN** ein Admin-Passwort ist gesetzt und der Benutzer ist authentifiziert
- **WHEN** alle 5 Schritte von System-Test 9 per Template-Walker ausgeführt und das Formular abgesendet wird
- **THEN** wird der Test ohne Fehler abgeschlossen

<!-- consolidated from micro-spec dora-dashboard [T002014] -->

### Requirement: DORA UI Removed (Stub)

The DORA dashboard UI SHALL NOT be re-introduced. Historical DORA metrics
(deployment frequency, lead time, change-failure rate, MTTR) remain available
through the CLI gate `vda.sh cfr` and direct `tickets.pr_events` queries.

#### Scenario: No DORA UI surface

- **GIVEN** an authenticated admin on `/admin`
- **WHEN** the sidebar or shortcuts render
- **THEN** no link to `/admin/dora` is present, the redirect stub page
  (`components/website/src/pages/admin/dora.astro`) has been removed, and the URL
  returns a 301 redirect to `/admin/pipeline?tab=analytics` (handled by the
  `redirectMiddleware` / `REDIRECT_MAP` in `components/website/src/middleware/redirect-map.ts`,
  independent of the deleted stub page)

<!-- merged from change delta monitoring-alerts.md (329d8c40680b) -->

<!-- merged from change delta monitoring-alerts.md (ad774fac777e) -->

<!-- merged from change delta monitoring-alerts.md (fe99050d468f) -->

<!-- merged from change delta monitoring-alerts.md (66b98634b5ad) -->