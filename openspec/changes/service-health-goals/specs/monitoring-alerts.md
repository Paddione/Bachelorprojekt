# monitoring-alerts.md — Delta Spec für T005321 (service-health-goals)

_Ergänzt die SSOT-Spezifikation um service-level health measurement requirements,
die über die existierenden E2E-Web-Health-Szenarien (Infrastructure Service Health Sweep,
Zeilen 321-356) hinausgehen und internen Infrastruktur-Service-Health, Alertmanager-
Konfiguration, CronJob-Erfolg sowie Deployment-Drift prüfen._

---

## ADDED Requirements

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
