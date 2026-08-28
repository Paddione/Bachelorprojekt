## MODIFIED Requirements

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
`backup-restore-verify`) in namespace `workspace` or `workspace-korczewski` SHALL raise a
Prometheus alert `BackupJobFailed` with label `severity: critical` within the rule evaluation
window.

Since T016592 the alert SHALL NOT produce an outbound notification: it is observable in the
Prometheus and Alertmanager UI only. Detecting a failed nightly run therefore depends on a manual
audit, which is the consequence the operator accepted when all email notification was switched
off.

#### Scenario: Forced failed backup run produces a signal

- **GIVEN** the PrometheusRule `workspace-alerts` contains the group `backup.rules`
- **WHEN** a backup Job in one of the covered namespaces transitions to failed
  (`increase(kube_job_status_failed[12h]) > 0`)
- **THEN** the alert `BackupJobFailed` fires with `severity: critical` and is visible in the
  Alertmanager UI
- **AND** it resolves to the `null` receiver, so no mail is sent

## ADDED Requirements

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

## REMOVED Requirements

### Requirement: Email Notification Receiver

**Reason:** T016592 schaltet sämtliche ausgehenden Benachrichtigungs-E-Mails der Plattform ab.
Die Anforderung verlangte das Gegenteil — mindestens einen `emailConfigs:`-Eintrag in
`k3d/monitoring/alertmanager-config.yaml` — und ist mit dieser Entscheidung unvereinbar. An ihre
Stelle tritt die Anforderung "Blackhole Receiver".

**Migration:** Der Guard `alertmanager-config.yaml routes via email while Pushover creds are
absent` in `tests/spec/monitoring-alerts.bats` wird auf die Blackhole-Szenarien umgestellt. Die
vier Guards in `tests/spec/monitoring-alerts/backup-recipient-daily-repeat.bats`, die den
`backup-email`-Receiver und die `BACKUP_ALERT_EMAIL`-Variable absichern, entfallen mit dem
Receiver; `BACKUP_ALERT_EMAIL` bleibt in `environments/schema.yaml` deklariert, damit eine
spätere Wiedereinführung keinen Schema-Eingriff braucht.
