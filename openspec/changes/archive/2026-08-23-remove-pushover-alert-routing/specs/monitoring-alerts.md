## MODIFIED Requirements

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
