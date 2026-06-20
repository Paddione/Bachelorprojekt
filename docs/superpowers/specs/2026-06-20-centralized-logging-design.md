---
title: "Centralized Logging: Loki+Grafana Enhancement"
date: 2026-06-20
status: draft
ticket_id: null
plan_ref: null
domains: [website, monitoring, infra]
---

# Centralized Logging: Loki+Grafana Enhancement

## Kontext & Motivation

Loki, Grafana und Promtail sind bereits deployed und sammeln alle Pod-Logs. Der Bottleneck ist **Log-Qualität**, nicht Log-Infrastruktur:

- `console.error('[api/factory-floor]', err)` produziert unlesbaren Plaintext in Loki
- Keine Request-IDs → Logs einzelner Requests nicht korrelierbar
- Keine Grafana-Dashboards für Log-Exploration (nur Metrics-Dashboards existieren)
- Traefik Access-Logs nicht konfiguriert
- Keycloak schreibt Audit-Events ohne strukturiertes Format

## Ziele

1. Strukturierte JSON-Logs aus allen Website-API-Routes (via Pino)
2. Request-Korrelation: X-Request-ID durch gesamten Stack
3. Traefik Access-Logs aktiviert und in Loki querybar
4. Keycloak Audit-Events strukturiert geloggt
5. 4 Grafana-Dashboards für Log-Exploration und Audit-Trail
6. Meaningful error responses: Fehlercodes + requestId in API-Responses

## Out of Scope

- OpenTelemetry Traces (eigenes Feature)
- Log-Archivierung über 7 Tage (Loki-Retention bleibt bei 336h/14d)
- Per-Brand Log-Isolation (Loki-Labels reichen für Admin-Nutzung)
- Staging-spezifische Dashboards

## Architektur: 5 Schichten

```
┌─────────────────────────────────────────────────────────┐
│  Schicht 5: Grafana Dashboards (NEU)                    │
│  Error-Rates · API-Explorer · Audit-Trail · Access-Logs │
├─────────────────────────────────────────────────────────┤
│  Schicht 4: Loki Query Layer (vorhanden ✓)              │
│  Label-Filter: {namespace, brand, app, level}           │
├─────────────────────────────────────────────────────────┤
│  Schicht 3: Promtail Enrichment (Erweiterung)           │
│  JSON-Pipeline · Label-Extraktion · Access-Log-Parser   │
├─────────────────────────────────────────────────────────┤
│  Schicht 2: App Structured Logging (NEU: Pino)          │
│  logger.ts · Astro-Middleware · API-Routes-Migration    │
├─────────────────────────────────────────────────────────┤
│  Schicht 1: Log Collection (vorhanden ✓)                │
│  Loki + Promtail DaemonSet + Grafana deployed           │
└─────────────────────────────────────────────────────────┘
```

## Schicht 2: Application Structured Logging

### logger.ts (Singleton)

**Datei:** `website/src/lib/logger.ts`

Pino-Logger-Singleton, SSR-only. Schreibt JSON zu stdout — Promtail sammelt automatisch.

Log-Format:
```json
{
  "level": "error",
  "time": 1750000000000,
  "requestId": "req-abc123",
  "userId": "keycloak-uuid-or-null",
  "method": "POST",
  "path": "/api/factory-floor",
  "statusCode": 500,
  "durationMs": 45,
  "err": {
    "type": "Error",
    "message": "DB connection refused",
    "stack": "Error: DB connection refused\n  at ..."
  },
  "msg": "Factory floor metrics fetch failed"
}
```

Pino-Konfiguration:
- `level`: `"info"` in Dev, `"warn"` in Prod (via `PINO_LOG_LEVEL` env var)
- `serializers`: Pino-Standard-Error-Serializer (type, message, stack)
- `transport`: kein (stdout JSON direkt — kein prettify in Prod)
- `base`: `{ service: "website" }` — wird jedem Log-Eintrag hinzugefügt

### Astro Middleware

**Datei:** `website/src/middleware/logging.ts`

Integriert in die Astro-Middleware-Chain (`website/src/middleware/index.ts`).

Aufgaben:
1. Liest `X-Request-ID` Header (von Traefik gesetzt in Prod)
2. Generiert eigene ID mit nanoid(12) falls Header fehlt (Dev)
3. Schreibt `locals.requestId` für alle API-Routes
4. Schreibt `locals.requestLogger` — Pino Child-Logger mit Request-Kontext
5. Loggt Request-Start (`info`) und Response-Ende (`info`/`warn`/`error` je nach Status)

### API-Routes-Migration

~20 Dateien unter `website/src/pages/api/`. Mechanisches Ersetzen:

**Vorher:**
```typescript
} catch (err) {
  console.error('[api/factory-floor]', err);
  return new Response('Internal Server Error', { status: 500 });
}
```

**Nachher:**
```typescript
} catch (err) {
  locals.requestLogger.error({ err }, 'Factory floor metrics fetch failed');
  return new Response(JSON.stringify({
    error: 'METRICS_FETCH_FAILED',
    requestId: locals.requestId,
  }), { status: 500, headers: { 'Content-Type': 'application/json' } });
}
```

Error-Qualitäts-Regeln (gelten für alle Routes):
- Spezifische Fehlercodes statt generischem "Internal Server Error"
- Stack-Trace im Log, **nicht** in der Response (kein Leak)
- `requestId` in der Response → Support kann in Loki suchen
- DB-Fehler mit Operationskontext, ohne sensitive Query-Parameter

## Schicht 3: Infrastructure Enhancements

### Traefik Access Logs

**Datei:** `k3d/traefik-config.yaml` (neu)

`HelmChartConfig`-Patch für k3s-managed Traefik — kein eigenes Deployment:

```yaml
apiVersion: helm.cattle.io/v1
kind: HelmChartConfig
metadata:
  name: traefik
  namespace: kube-system
spec:
  valuesContent: |-
    additionalArguments:
      - "--accesslog=true"
      - "--accesslog.format=json"
      - "--accesslog.fields.defaultmode=keep"
      - "--accesslog.fields.headers.defaultmode=drop"
      - "--accesslog.fields.headers.names.X-Request-ID=keep"
```

Traefik schreibt JSON-Access-Logs zu stdout → Promtail sammelt ohne weitere Konfiguration.

### X-Request-ID Fluss

Traefik hat kein eingebautes Request-ID-Plugin. Stattdessen: **Astro-Middleware generiert immer die ID** (nanoid 12-stellig), wenn der Header fehlt. Traefik wird konfiguriert den Header in Access-Logs zu erhalten (`accesslog.fields.headers.names.X-Request-ID=keep`).

Fluss:
1. Request kommt an → Astro-Middleware prüft `X-Request-ID` Header
2. Falls nicht gesetzt: nanoid(12) generieren, als `locals.requestId` speichern
3. Response: `X-Request-ID` Header in Response setzen (Support-Nutzbarkeit)
4. Traefik Access-Log: Header wird mitgeloggt → Korrelation Traefik-Log ↔ App-Log

Kein Traefik-Plugin nötig — Astro ist der einzige ID-Generator.

### Promtail JSON Pipeline

**Datei:** `k3d/monitoring/values/promtail-values.yaml` (Erweiterung)

Pipeline-Stages für JSON-fähige Pods (Website, Keycloak):
1. **JSON-Stage**: Parse Log-Zeile als JSON (non-fatal bei Fehler — Fallback auf raw)
2. **Labels-Stage**: Extrahiere `level` aus JSON → Loki-Label `{level="error"}`
3. **Drop-Stage**: Verwerfe `level="debug"` in Prod (Rausch-Reduktion)

Nach `task monitoring:render` wird `promtail-rendered.yaml` regeneriert.

### Keycloak JSON Logging

**Datei:** `k3d/keycloak.yaml` (Erweiterung env vars)

```yaml
- name: KC_LOG_CONSOLE_FORMAT
  value: "json"
- name: KC_LOG_LEVEL
  value: "INFO,org.keycloak.events:DEBUG"
```

Keycloak schreibt damit Audit-Events als JSON zu stdout — kein Sidecar nötig.

## Schicht 5: Grafana Dashboards

Alle Dashboards als JSON-Dateien unter `k3d/monitoring/dashboards/`. Grafana lädt via Sidecar-ConfigMap automatisch — kein manuelles UI-Klicken, vollständig GitOps-fähig.

### Dashboard 1: Log Explorer

**Datei:** `k3d/monitoring/dashboards/log-explorer.json`

- Loki-Datasource, Label-Filter-Dropdowns: `namespace`, `app`, `level`, `brand`
- Live-Tail-Panel + Zeit-Navigation
- Error-Rate-Graph: `sum(rate({level="error"}[5m])) by (app)`
- Haupteinstieg für manuelle Log-Suche

### Dashboard 2: API Error Tracker

**Datei:** `k3d/monitoring/dashboards/api-errors.json`

- Tabelle: Top-10 fehlgeschlagene Endpoints (aus Pino-Logs, aggregiert)
- Error-Häufigkeit über Zeit pro API-Route
- Klick auf `requestId` → Link zu gefilterter Loki-Suche (Explore-View)

### Dashboard 3: Traefik Access Log Analytics

**Datei:** `k3d/monitoring/dashboards/traefik-access.json`

- HTTP-Status-Code-Verteilung (2xx/3xx/4xx/5xx) über Zeit
- Top-10 langsamste Endpoints (aus `durationMs` in Access-Logs)
- 4xx/5xx-Rate-Panel mit Alert-Annotation-Schwelle

### Dashboard 4: Keycloak Audit Trail

**Datei:** `k3d/monitoring/dashboards/keycloak-audit.json`

- Login-Erfolge vs. -Fehler über Zeit
- Failed-Auth-Events Tabelle: `user`, `clientId`, `ipAddress`, `time`
- Unusual-Activity-Panel: >5 Failed-Logins/5min (Loki-Alert-Rule)

## Technische Constraints

| Constraint | Detail |
|---|---|
| Pino nur SSR | Kein Client-Bundle-Einfluss — `import pino` nur in `website/src/` Server-Code |
| `task monitoring:render` nach Wertänderungen | Helm-Outputs (`promtail-rendered.yaml`, `loki-rendered.yaml`) müssen nach values-Änderung neu generiert werden |
| HelmChartConfig → Traefik-Restart | `k3d/traefik-config.yaml` triggert k3s-internen Traefik-Upgrade; dev-cluster kurz nicht erreichbar |
| Dashboard-JSON via configMapGenerator | Grafana-Sidecar-Pattern bereits in Monitoring-Kustomization etabliert — neues Verzeichnis reicht |
| `PINO_LOG_LEVEL` env var | Muss in `environments/schema.yaml` registriert werden + in `k3d/website.yaml` referenziert |

## Akzeptanzkriterien

1. Alle API-Routes unter `website/src/pages/api/` nutzen `requestLogger` statt `console.error`
2. Ein fehlgeschlagener API-Request ist in Loki mit `{app="website", level="error"}` + `requestId` auffindbar
3. Traefik Access-Logs in Loki querybar via `{job="kubernetes-pods", container="traefik"}`
4. Keycloak Login-Events in Loki querybar via `{app="keycloak"}` mit `level`-Label
5. Alle 4 Grafana-Dashboards laden ohne Fehler
6. `task test:changed` + `task freshness:check` grün nach Implementierung
