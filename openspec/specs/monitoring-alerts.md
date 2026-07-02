# monitoring-alerts
<!-- baseline SSOT — generiert aus Codebase-Analyse am 2026-06-20 -->

## Purpose

Das Monitoring-Alerting-System definiert Prometheus-Alertregeln und Alertmanager-Konfiguration für die Workspace-Plattform. Es stellt sicher, dass kritische Cluster-Ereignisse (Pod-Crashes, hohe Ressourcenauslastung, Fehlerraten) zuverlässig erkannt und über Pushover sowie E-Mail benachrichtigt werden. Die Konfiguration ist markenunabhängig und muss für alle Cluster-Umgebungen valide bauen.

---

## Requirements

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
<!-- bats: T000617-alert-rules.bats -->

The system SHALL declare exactly the 8 mandatory alert rules: `PodCrashLoopBackOff`, `HighCPUUsage`, `HighMemoryUsage`, `HighDiskUsage`, `High5xxErrorRate`, `PodRestartSpike`, `NodeHighCPUUsage`, and `NodeFilesystemAlmostFull`.

#### Scenario: Alle Pflicht-Alerts deklariert *(BATS)*
- **GIVEN** die Datei `k3d/monitoring/prometheus-rules.yaml` existiert
- **WHEN** der Inhalt auf alle 8 `alert:` Einträge geprüft wird
- **THEN** sind alle acht Pflicht-Alerts — `PodCrashLoopBackOff`, `HighCPUUsage`, `HighMemoryUsage`, `HighDiskUsage`, `High5xxErrorRate`, `PodRestartSpike`, `NodeHighCPUUsage`, `NodeFilesystemAlmostFull` — vorhanden

---

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
<!-- bats: T000617-alert-rules.bats -->

The system SHALL configure a Pushover receiver in the Alertmanager configuration at `k3d/monitoring/alertmanager-config.yaml`.

#### Scenario: Pushover-Empfänger konfiguriert *(BATS)*
- **GIVEN** die Datei `k3d/monitoring/alertmanager-config.yaml` existiert
- **WHEN** der Inhalt auf Receiver-Konfigurationen geprüft wird
- **THEN** enthält die Datei mindestens einen Eintrag `pushoverConfigs:`

---

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

#### Scenario: Keycloak OIDC Discovery erreichbar *(E2E)*
- **GIVEN** `PROD_DOMAIN` ist gesetzt und Keycloak läuft
- **WHEN** `GET https://auth.<domain>/realms/workspace/.well-known/openid-configuration` aufgerufen wird
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
