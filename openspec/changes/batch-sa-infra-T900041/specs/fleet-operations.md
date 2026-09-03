## ADDED Requirements

### Requirement: Vaultwarden PROD startet mit vollständiger SMTP-Konfiguration

The system SHALL configure the `vaultwarden` Deployment in the `workspace` namespace with both
`SMTP_FROM` and `SMTP_HOST` (plus the existing `SMTP_USERNAME`/`SMTP_PASSWORD`), so Vaultwarden can
start with email support and no longer enters CrashLoopBackOff with the config error "Both SMTP_HOST
and SMTP_FROM need to be set for email support without USE_SENDMAIL".

#### Scenario: PROD-Vaultwarden-Patch enthält SMTP_FROM

- **GIVEN** das Deployment-Manifest `prod/patch-vaultwarden.yaml`
- **WHEN** die Container-Env des `vaultwarden`-Containers geprüft wird
- **THEN** enthält der Patch einen `SMTP_FROM`-Env-Eintrag, der per envsubst auf den Wert aus
  `environments/mentolder.yaml` (Key `SMTP_FROM`) auflöst
- **AND** der Patch weiterhin `SMTP_HOST` setzt

#### Scenario: Vaultwarden-Start ohne Config-Fehler

- **GIVEN** die angepassten Manifeste sind deployed und Vaultwarden startet neu
- **WHEN** der Vaultwarden-Container-Log geprüft wird
- **THEN** erscheint der Fehler "Both SMTP_HOST and SMTP_FROM need to be set" nicht mehr
- **AND** `vault.mentolder.de` antwortet mit HTTP 200 anstelle von 503

### Requirement: Penpot-Secret-Keys sind in beiden Frozen/Fresh workspace-secrets Vollständig

The system SHALL ensure the Secrets `workspace/workspace-secrets` (PROD) and
`workspace-staging/workspace-secrets` (Staging) contain the keys `PENPOT_MINIO_SECRET_KEY`,
`PENPOT_DB_PASSWORD` and `SESSIONS_CRON_TOKEN`, so the Penpot stack (penminio, penpot backend and the
sessions-purge CronJob) stops failing with "couldnt find key ... in Secret
workspace[-staging]/workspace-secrets" and the `flux-staging` Kustomization reaches Ready=True.

#### Scenario: Schema und SealedSecrets enthalten die drei Penpot-Keys

- **GIVEN** `environments/schema.yaml` (Zeilen ~629/643/1049)
- **WHEN** `task env:seal ENV=mentolder` und `task env:seal ENV=staging` neu ausgeführt wurden
- **THEN** enthalten `environments/sealed-secrets/fleet-mentolder.yaml` und `staging.yaml`
  `PENPOT_MINIO_SECRET_KEY`, `PENPOT_DB_PASSWORD` und `SESSIONS_CRON_TOKEN` mit nicht-leerem Ciphertext
- **AND** die resultierenden live `workspace-secrets`-Secrets enthalten alle drei Keys

#### Scenario: Penpot-Stacks laufen wieder und verwaiste ReplicaSets sind gepruned

- **GIVEN** die Secrets sind vollständig und die Penpot-YAMLs unverändert
- **WHEN** Flux die Penpot-Objekte erneut reconciled
- **THEN** sind die Penpot/penminio-Pods Running (kein CreateContainerConfigError / ImagePullBackOff)
- **AND** die verwaisten Redundant-ReplicaSets in PROD und Staging sind entfernt
- **AND** `flux-staging` meldet Ready=True

### Requirement: Monitoring (blackbox-exporter, Grafana) ist wieder verfügbar

The system SHALL make the `monitoring` namespace health checks operational again: the
`blackbox-exporter` Deployment shall run with a non-root user compatible with its image (no more
"container has runAsNonRoot and image will run as root"), and the `monitoring-grafana` pods shall
complete their init and reach Ready, so Prod-Ausfaelle wieder per Blackbox-Probe und Alerts erkannt
werden.

#### Scenario: blackbox-exporter PodSecurityContext ist non-root-kompatibel

- **GIVEN** das Deployment `k3d/monitoring/blackbox-exporter.yaml`
- **WHEN** der Pod-SecurityContext geprüft wird
- **THEN** ist ein `runAsUser` gesetzt (z.B. 65534), sodass `runAsNonRoot: true` und das
  unveränderte Image nicht kollidieren
- **AND** der Pod erreicht Running ohne CreateContainerConfigError

#### Scenario: Grafana-Init-Container hängt nicht mehr

- **GIVEN** die Grafana-Rendered-Manifeste (`k3d/monitoring/kube-prometheus-stack-rendered.yaml`)
- **WHEN** die Ursache des Init:0/1-Hangs verifiziert und behoben ist
- **THEN** erreicht `monitoring-grafana` Ready (Init abgeschlossen)
- **AND** `grafana.<domain>` ist wieder erreichbar

### Requirement: Fehlschlagende CronJobs stapeln keine Pods und laufen zielgerichtet

The system SHALL make the `scheduled-publish` and `tests-results-retention` CronJobs either succeed
or be controlled (suspend/ttl/backoff), so fehlgeschlagene Pods sich nicht ueber Tage stapeln.

#### Scenario: scheduled-publish erreicht die korrekte Publish-URL und loggt Fehler

- **GIVEN** das CronJob-Manifest `k3d/cronjob-scheduled-publish.yaml` und die prod-Overlays
- **WHEN** die Fehlursache des leeren Logs (Exit vor erstem Write) klaert und behoben ist
- **THEN** ruft der Pod die korrekte `website.<ns>.svc.cluster.local/api/cron/scheduled-publish` URL
  auf und das Log ist bei Fehler nicht mehr leer
- **AND** der CronJob erreicht keine `BackoffLimitExceeded`-Events mehr

#### Scenario: tests-results-retention ist in eingefrorenen Namespaces suspendiert und gestapelte Reste werden geraumt

- **GIVEN** `workspace-korczewski` ist seit 2026-07-23 eingefroren (T002479)
- **WHEN** die CronJob-Spec geprüft wird
- **THEN** ist der `tests-results-retention`-CronJob in eingefrorenen Namespaces suspendiert
- **AND** `ttlSecondsAfterFinished` (bzw. passendes `failedJobsHistoryLimit`) ist gesetzt, damit
  Fehl-Pods sich nicht stapeln
- **AND** die Ursache im Retention-Skript (kubectl exec-Fehler) ist klaert/behoben

### Requirement: ghcr-pull-secret ist in workspace-office und website-staging vorhanden

The system SHALL provision the `ghcr-pull-secret` (Docker-Registry-Secret) in the namespaces
`workspace-office` and `website-staging`, so Collabora (workspace-office) und die Website (staging)
weiterhin Images aus GHCR pullen koennen ohne `FailedToRetrieveImagePullSecret`.

#### Scenario: ghcr-pull-secret existiert in beiden Ziel-Namespaces

- **GIVEN** die Deployment-Manifeste referenzieren `ghcr-pull-secret` als imagePullSecret
- **WHEN** `kubectl get secret -n workspace-office ghcr-pull-secret` und `-n website-staging`
  ausgeführt werden
- **THEN** existieren beide Secrets mit Typ `kubernetes.io/dockerconfigjson`
- **AND** das Secret ist korrekt signiert/versiegelt (SealedSecret-Quelle vorhanden)

#### Scenario: Keine FailedToRetrieveImagePullSecret-Events mehr

- **GIVEN** die Secrets sind deployed und Flux reconciled
- **WHEN** die frischen Pods einen Image-Pull durchführen
- **THEN** erscheinen keine `FailedToRetrieveImagePullSecret`-Warnungen für `ghcr-pull-secret`
  in `workspace-office` oder `website-staging`

### Requirement: Readiness-Probes von nextcloud und llm-proxy sind wieder grün

The system SHALL resolve the readiness failures of `nextcloud` (workspace/workspace-staging) and the
`llm-proxy` (workspace-dev), so weder 727 Restarts noch 5170 connection-refused-Events dauerhaft
entstehen und die Dienste als Ready gemeldet werden (oder kontrolliert abgebaut sind).

#### Scenario: Nextcloud-Readiness-Probe entspricht der tatsächlichen Antwortzeit/500er-Ursache

- **GIVEN** Staging `nextcloud` (727 Restarts, HTTP 500) und PROD (`context deadline exceeded` on
  /status.php)
- **WHEN** die 500er-Ursache aus den Staging-Logs klaert und der PROD-Readiness-Timeout gegen die
  echte status.php-Antwortzeit geprüft ist
- **THEN** sind die readinessProbe-Werte (`timeoutSeconds`, `failureThreshold`) an die Messung
  angepasst und/oder die 500er-Ursache ist behoben
- **AND** `nextcloud` meldet Ready und die Restarts sinken auf normal

#### Scenario: Dev-llm-proxy ist entweder Ready oder kontrolliert entfernt

- **GIVEN** der `llm-proxy` in `workspace-dev` hoert nicht auf :18235 (5170x connection refused)
- **WHEN** geklärt ist, ob workspace-dev den llm-proxy noch braucht
- **THEN** lauscht der Container korrekt auf :18235 (Livez-Probe gruen) ODER der llm-proxy wird aus
  `workspace-dev` abgebaut
- **AND** die neue Readiness-Probe erzeugt keine connection-refused-Events mehr
