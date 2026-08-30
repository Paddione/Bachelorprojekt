# Proposal: service-health-goals

## Why

Die existierenden 50+ Health-Goals (`.claude/lib/goals.md`) decken **Repo-Hygiene** (G-RH*), **K8S-Cluster-Gesundheit** (G-K8S*, G-OPS*) und **CI/CD-Metriken** (G-CI*, G-DORA*) ab. Fehlend ist eine **service-level functional verification**:

- **2 Blackbox-Probes** für 14+ öffentliche Services (G-SLO01 prüft nur web.*)
- **Alertmanager-Receiver = null** — niemand wird benachrichtigt (T016592)
- **CronJob-Erfolg** nicht messbar (G-DB04 misst nur Frische, nicht Erfolg)
- **Config-Drift** (Manifest vs. Live-Cluster) nicht detektierbar
- **Infrastruktur-Service-Probes** (NATS, Redis, Coturn, Janus) nicht vorhanden

Die Requirements existieren bereits im OpenSpec (**monitoring-alerts.md** §"Infrastructure Service Health Sweep", **fleet-operations.md** §"System-weiter Service-Health-Sweep (NFA-INFRA)"), sind aber keine messbaren Health-Goals — sie sind unverletzlich, weil niemand sie misst.

## What

Neue messbare Health-Goals, die service-level functional health prüfen:

### A) Service Endpoint Probes (G-SVC01–SVC04)
- **G-SVC01**: Anzahl öffentlicher Services ohne Blackbox-Health-Check (Target: 0)
- **G-SVC02**: Pocket-ID OIDC Discovery erreichbar (Target: 0)
- **G-SVC03**: Nextcloud Health-Endpoint antwortet korrekt (Target: 0)
- **G-SVC04**: Whiteboard/WebSocket-Verbindung status (Target: 0)

### B) Internal Infrastructure (G-INF01–04)
- **G-INF01**: TURN-Server antwortet auf STUN-Request (Target: 0)
- **G-INF02**: NATS-Listener erreichbar (Target: 0)
- **G-INF03**: Janus-Gateway antwortet auf /stats (Target: 0)
- **G-INF04**: Redis-Verbindung möglich (PING → PONG) (Target: 0)

### C) CronJob Success (G-CJ01–03)
- **G-CJ01**: CronJob-Lauf erfolgreich, nicht nur frisch (Target: 0)
- **G-CJ02**: Backup erfolgreich (exit 0 im Log) (Target: 0)
- **G-CJ03**: Restore-Verify erfolgreich (Target: 0)

### D) Alerting (G-ALR01–02)
- **G-ALR01**: Alertmanager-Receiver konfiguriert (nicht null) (Target: 0)
- **G-ALR02**: Kritische Alerts feuern (Pipeline intakt) (Target: 0)

### E) Config Drift (G-DRIFT01–03)
- **G-DRIFT01**: Deployment-Replikation expected == live (Target: 0)
- **G-DRIFT02**: Probe-Konfiguration manifest == live (Target: 0)
- **G-DRIFT03**: SealedSecret-Decryption konsistent (Target: 0)

### Messung
Erweiterung von `scripts/lib/runtime-health-measure.py` um neue measurements:
- `svc-probe`: HTTP blackbox für alle public services (basierend auf Ingress-Manifests)
- `infra-tcp`: TCP probe für interne Services (Coturn, NATS, Redis)
- `infra-http`: HTTP probe für interne Services (Janus)
- `cron-status`: CronJob last run success (kubectl)
- `alert-status`: Alertmanager receiver config (kubectl)
- `drift`: Manifest vs live cluster drift (kubectl diff)

Integration in `health-goals-check.sh` und `.claude/lib/goals.md`.

## Impact

### Betroffene Dateien
- `.claude/lib/goals.md` — neue Goals
- `scripts/lib/runtime-health-measure.py` — neue measurements
- `scripts/health-goals-check.sh` — Integration
- `k3d/monitoring/blackbox-exporter.yaml` — neue Probe-Targets (optional, Teil von G-SVC01)
- `k3d/monitoring/alertmanager-config.yaml` — Wiedereinschalten (Teil von G-ALR01, optional)
- `scripts/lib/manifest-drift-check.sh` — neu (G-DRIFT01–03)
- `tests/spec/health-goals/` — BATS-Guards für neue Goals

### Bestehende Specs
Die Delta-Specs werden auf folgende Parent-SSOT-Slugs geschrieben:
- `monitoring-alerts.md` — für G-SVC* und G-ALR*
- `fleet-operations.md` — für G-INF*, G-CJ*, G-DRIFT*

### Risiko
- Messungen benötigen kubectl/Zugriff auf den Cluster — lokale Messung nur mit aktivem k3d/fleet
- Neue Probe-Targets im blackbox-exporter benötigen ein Re-deploy
- Alertmanager-Wiedereinschalten benötigt validierte Credentials
