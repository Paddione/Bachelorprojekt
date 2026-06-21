# Proposal: centralized-logging

_Ticket: T000964_

## Why

Loki, Grafana und Promtail sind bereits deployed und sammeln alle Pod-Logs — die Infrastruktur existiert. Das Problem ist **Log-Qualität und -Nutzbarkeit**:

- Alle ~20 Website-API-Routes nutzen `console.error('[scope]', err)` → unlesbarer Plaintext in Loki, kein Stack-Trace, kein User-Kontext
- Keine Request-IDs → Logs eines einzelnen Requests nicht korrelierbar; Support kann Fehler nicht reproduzieren
- Traefik Access-Logs sind nicht aktiviert → HTTP-Fehler-Muster unsichtbar
- Keycloak schreibt Audit-Events ohne strukturiertes Format → Security-Events nicht querybar
- Keine Grafana-Dashboards für Logs (nur Metrics-Dashboards existieren) → Operator sieht keine strukturierte Fehlerübersicht

## What

### Schicht 2: Application Structured Logging (Pino)

- `website/src/lib/logger.ts` — Pino-Singleton, JSON zu stdout, SSR-only
- `website/src/middleware/logging.ts` — X-Request-ID generieren/lesen, Request-Start/Ende loggen, `locals.requestId` + `locals.requestLogger` bereitstellen
- Migration aller ~20 API-Routes von `console.error` → `requestLogger.error` mit strukturiertem Kontext (requestId, userId, err, path, durationMs)
- Meaningful Error Responses: spezifische Fehlercodes + requestId in Response-Body

### Schicht 3: Infrastructure Enhancements

- `k3d/traefik-config.yaml` (neu) — HelmChartConfig-Patch: Traefik Access-Logs als JSON zu stdout, X-Request-ID Header in Logs erhalten
- `k3d/monitoring/values/promtail-values.yaml` — JSON-Pipeline-Stages: JSON-Parse, level-Label-Extraktion, debug-Drop in Prod
- `k3d/keycloak.yaml` — `KC_LOG_CONSOLE_FORMAT=json` + `KC_LOG_LEVEL=INFO,org.keycloak.events:DEBUG`
- `environments/schema.yaml` — `PINO_LOG_LEVEL` registrieren

### Schicht 5: Grafana Dashboards (4 neue Dashboards)

- `k3d/monitoring/dashboards/log-explorer.json` — Haupt-Log-Explorer mit Namespace/App/Level-Filter
- `k3d/monitoring/dashboards/api-errors.json` — Top-10 fehlgeschlagene Endpoints, requestId-Korrelation
- `k3d/monitoring/dashboards/traefik-access.json` — HTTP-Status-Verteilung, Top-10 langsame Endpoints
- `k3d/monitoring/dashboards/keycloak-audit.json` — Login-Events, Failed-Auth-Tabelle, Unusual-Activity-Panel

## Acceptance Criteria

1. Alle API-Routes nutzen `requestLogger` statt `console.error`
2. Fehlgeschlagener API-Request in Loki auffindbar via `{app="website", level="error"}` + requestId
3. Traefik Access-Logs in Loki querybar via `{container="traefik"}`
4. Keycloak Login-Events in Loki querybar via `{app="keycloak"}` mit level-Label
5. Alle 4 Grafana-Dashboards laden ohne Fehler
6. `task test:changed` + `task freshness:check` grün
