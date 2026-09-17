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
falls through to the Operator's own default receiver and is discarded outside of the routing tree
declared in `k3d/monitoring/alertmanager-config.yaml`.

Since T016592 the receiver that alerts resolve to is the intentional blackhole receiver `null` —
a receiver declared with a name and no notification configs. Alerts SHALL therefore reach the
routing tree declared in `workspace-alerts` and terminate there without producing a notification.
The matcher strategy remains required: it is what keeps routing under the control of this
repository's configuration rather than the Operator's default.

#### Scenario: Routing test resolves to the blackhole receiver

- **GIVEN** the Alertmanager CR carries `alertmanagerConfigMatcherStrategy.type: None`
- **WHEN** `amtool config routes test` is run with labels `namespace=workspace` and
  `alertname=BackupJobFailed`
- **THEN** the resolved receiver is the `null` receiver of `workspace-alerts`

#### Scenario: Patch is registered in the kustomization

- **GIVEN** the file `k3d/monitoring/alertmanager-matcher-strategy-patch.yaml` exists
- **WHEN** `k3d/monitoring/kustomization.yaml` is inspected
- **THEN** its `patches:` list contains `alertmanager-matcher-strategy-patch.yaml`
  (Positiv-Anker: the pre-existing entry `loki-sc-rules-resources-patch.yaml` is still present)

---

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

### Requirement: Blackhole Receiver

The system SHALL declare exactly one receiver named `null` in
`k3d/monitoring/alertmanager-config.yaml`, carrying a name and no notification configs of any
kind, and `spec.route.receiver` SHALL reference it.

An `AlertmanagerConfig` without any receiver is invalid and is discarded wholesale by the
Prometheus Operator — the same failure mode that the T014542 comment in the file already records
for empty Pushover credentials. The blackhole receiver is therefore how "no notification" is
expressed, rather than by deleting the receivers outright.

#### Scenario: Blackhole-Receiver ist deklariert und referenziert *(BATS)*

- **GIVEN** die Datei `k3d/monitoring/alertmanager-config.yaml` existiert
- **WHEN** ihr Inhalt geprüft wird
- **THEN** enthält `spec.receivers` einen Eintrag `name: "null"` ohne `emailConfigs`,
  `pushoverConfigs` oder `webhookConfigs`
- **AND** `spec.route.receiver` ist `"null"`

#### Scenario: Keine Benachrichtigungs-Konfiguration mehr vorhanden *(BATS)*

- **GIVEN** die Datei `k3d/monitoring/alertmanager-config.yaml` existiert
- **WHEN** ihr Inhalt auf Benachrichtigungs-Konfigurationen geprüft wird
- **THEN** enthält sie keinen `emailConfigs:`-Eintrag
  (Positiv-Anker: der `receivers:`-Block existiert weiterhin und trägt den `null`-Receiver)

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

### Requirement: Blackbox-Probe-Coverage aller öffentlichen Services

Das System SHALL sicherstellen, dass jeder öffentlich zugängliche Service (definiert über
Ingress-Manifeste in `k3d/`, `prod-fleet/mentolder/`, `prod-fleet/korczewski/`) eine
blackbox HTTP health probe in `k3d/monitoring/blackbox-exporter.yaml` hat.
Services ohne Probe zählen als verletzbar, weil ein Ausfall nicht durch Prometheus
`probe_success` erkannt wird.

Die Messung erfolgt über `python3 scripts/lib/runtime-health-measure.py svc-probe`,
die die Anzahl der ungedeckten Services als Integer zurückgibt (0 = alle abgedeckt).

#### Scenario: Public Ingress services matched against blackbox probe targets

- **GIVEN** Ingress-Manifeste existieren mit backend services und hostnames
- **AND** `k3d/monitoring/blackbox-exporter.yaml` enthält Probe-KIND resources
- **WHEN** `svc-probe` aufgerufen wird
- **THEN** ist das Ergebnis die Anzahl der Ingress-Backend-Services, die KEINEM
  blackbox-Probe-Target entsprechen
- **AND** bei vollständiger Abdeckung ist das Ergebnis 0

#### Scenario: Ergebnis ist ein Integer ≥ 0

- **GIVEN** das Repository ist ausgecheckt
- **WHEN** `svc-probe` aufgerufen wird
- **THEN** endet der Befehl mit exit 0 und gibt einen nicht-negativen Integer aus
- **AND** bei Fehlern gibt das Skript "-" aus (fail-closed)

---

### Requirement: Internal infrastructure services reachable

Jeder interne Infrastruktur-Service (Coturn/STUN:3478, Janus:8188, NATS:4222, Redis:6379)
SHALL auf TCP-Erreichbarkeit geprüft werden. Die Messung erfolgt über
`python3 scripts/lib/runtime-health-measure.py infra-tcp`.

Zusätzlich SHALL Janus `/stats` auf HTTP-Ebene gültiges JSON mit `"janus"` key
zurückgeben, geprüft via `infra-http`.

#### Scenario: All internal infra services reachable

- **GIVEN** Coturn, Janus, NATS und Redis sind im Cluster deployed
- **WHEN** `infra-tcp` aufgerufen wird
- **THEN** ist das Ergebnis 0
- **AND** `infra-http` (Janus /stats) ist 0

#### Scenario: One internal service unreachable

- **GIVEN** NATS ist nicht erreichbar (TCP connect fails)
- **WHEN** `infra-tcp` aufgerufen wird
- **THEN** ist das Ergebnis ≥ 1

---

### Requirement: CronJob success detection

Jede CronJob, die in namespace `workspace` oder `workspace-korczewski` läuft,
SHALL auf erfolgreichen letzten Lauf geprüft werden. Eine CronJob gilt als
"failed", wenn:

1. `lastScheduleTime > lastSuccessfulTime` (geplant, aber nicht erfolgreich ausgeführt)
2. `lastScheduleTime` ist älter als 2x der geplanten schedule interval
3. `lastScheduleTime` existiert nicht (CronJob hat noch nie gelaufen)

Die Messung erfolgt über `bash scripts/lib/cronjob-check.sh`,
die die Anzahl der CronJobs mit fehlgeschlagenem Lauf als Integer zurückgibt.

#### Scenario: CronJob never ran

- **GIVEN** eine CronJob existiert ohne `lastScheduleTime`
- **WHEN** `cronjob-check.sh` aufgerufen wird
- **THEN** ist das Ergebnis ≥ 1

#### Scenario: CronJob scheduled but never successful

- **GIVEN** eine CronJob hat `lastScheduleTime` aber keine `lastSuccessfulTime`
- **WHEN** `cronjob-check.sh` aufgerufen wird
- **THEN** ist das Ergebnis ≥ 1

#### Scenario: Last scheduled after last successful

- **GIVEN** eine CronJob hat `lastScheduleTime > lastSuccessfulTime`
- **WHEN** `cronjob-check.sh` aufgerufen wird
- **THEN** ist das Ergebnis ≥ 1

---

### Requirement: Alertmanager receiver configuration

Die Alertmanager-Konfiguration in `k3d/monitoring/alertmanager-config.yaml`
SHALL einen aktiven receiver (email, pushover, webhook) haben — nicht "null".

Die Messung erfolgt über `python3 scripts/lib/runtime-health-measure.py alert-status`,
die 0 zurückgibt, wenn ein gültiger receiver konfiguriert ist, und 1 sonst.

#### Scenario: Alertmanager has valid receiver

- **GIVEN** `alertmanager-config.yaml` enthält einen aktiven receiver
- **WHEN** `alert-status` aufgerufen wird
- **THEN** ist das Ergebnis 0

#### Scenario: Alertmanager receiver is "null"

- **GIVEN** `alertmanager-config.yaml` hat `receivers` mit nur dem "null"-blackhole
- **WHEN** `alert-status` aufgerufen wird
- **THEN** ist das Ergebnis 1

---

### Requirement: Deployment config drift detection

Die Deployment-Konfiguration im Cluster SHALL zwischen manifest-definierten Werten
(replicas, probes, sealed-secrets) und dem live-cluster Zustand übereinstimmen.

Die Messung erfolgt über `bash scripts/lib/manifest-drift-check.sh` mit den Modi:
- `replicas` — vergleiche `spec.replicas` mit `status.replicas`
- `probes` — prüfe readinessProbe/livenessProbe presence in manifest vs live
- `sealed` — prüfe SealedSecret status conditions (Unsealed=False)

#### Scenario: No deployment drift

- **GIVEN** alle Deployments haben `spec.replicas == status.replicas`
- **WHEN** `manifest-drift-check.sh replicas` aufgerufen wird
- **THEN** ist das Ergebnis 0

#### Scenario: SealedSecret has unsealed error

- **GIVEN** eine SealedSecret resource hat `status.conditions[].type == "Unsealed"`
  mit `status == "False"`
- **WHEN** `manifest-drift-check.sh sealed` aufgerufen wird
- **THEN** ist das Ergebnis ≥ 1

---

<!-- merged from change delta service-health-goals -->

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

The system SHALL declare exactly the 11 mandatory alert rules: `PodCrashLoopBackOff`,
`HighCPUUsage`, `HighMemoryUsage`, `HighDiskUsage`, `High5xxErrorRate`, `PodRestartSpike`,
`NodeHighCPUUsage`, `NodeFilesystemAlmostFull`, `BackupJobFailed`, `BackupCronJobStale`, and
`RestoreVerifyStale`.

#### Scenario: Alle Pflicht-Alerts deklariert *(BATS)*

- **GIVEN** die Datei `k3d/monitoring/prometheus-rules.yaml` existiert
- **WHEN** der Inhalt auf alle 11 `alert:` Einträge geprüft wird
- **THEN** sind alle elf Pflicht-Alerts vorhanden

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

<!-- merged from change delta monitoring-alerts.md (b3ce0ca2dc77) -->

<!-- merged from change delta monitoring-alerts.md (53fc7e9a1027) -->

<!-- merged from change delta monitoring-alerts.md (cb37665f5a10) -->