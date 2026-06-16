---
title: OpenTelemetry-Observability für den headless Software-Factory-Autopilot
slug: factory-otel
date: 2026-06-16
status: draft
ticket_id: T000883
plan_ref: docs/superpowers/plans/2026-06-16-factory-otel.md
domains: [infra, factory, website, monitoring]
brands: [mentolder, korczewski]
---

# Design-Spec: Factory-OTel-Observability

## 1. Problem & Intent

Der Software-Factory-Autopilot läuft **headless** auf dem WSL-Host via systemd-Timer
(`wakeup.sh` → `claude -p` → Workflow `dispatcher.js` → genestet `pipeline.js` Scout..Deploy).
Das **einzige Fenster** hinein sind heute `.remember/`-Logs. Es fehlt belastbare Observability
über **Token-Verbrauch, Kosten, Tool-Dauern, Commits/PRs pro Tick und Phasen-Laufzeiten** —
gerade seit der GPU-/Kosten-Minimierung (PR #1744) und der schwachen DeepSeek-Build-Qualität,
wo man genau wissen will: *Wo verbrennt welcher Tick wieviel Geld/Token, und in welcher Phase?*

**Intent:** OTLP-Telemetrie pro Pipeline-Phase + pro Dispatcher-Tick zu einem **self-hosted,
on-prem** OTel-Backend exportieren und in einem **eigenen Dashboard** (im Stil der bestehenden
Admin-UIs `/dev-status`, `/admin/cockpit`) sichtbar machen — statt das mitgelieferte Grafana-UI
zu nutzen. Spiegelt die dokumentierte Präferenz *„Factory-observable bevorzugen"* (agentic-first)
und *„all data stays on-premises"* (DSGVO).

### Entschiedene Gabelungen (User, 2026-06-16)
- **Backend:** Self-hosted OTel-Collector → vorhandener kube-prometheus-stack. **Kein SaaS**
  (Grafana Cloud/Datadog/Honeycomb scheiden wegen DSGVO/on-prem aus).
- **Visualisierung:** **Eigenes Dashboard** in der Website-Admin (das „Grafana-Äquivalent"),
  Prometheus bleibt der TSDB (das „Prometheus-Äquivalent" — nicht neu bauen, wiederverwenden).
  Dafür ein **Claude-Design-Prompt** als Layout-Vorlage (siehe §7).
- **Scope:** Voll — native Telemetrie **+** Factory-Spans **+** Collector **+** Dashboard.

## 2. Ground Truth (verifiziert)

| Fakt | Beleg |
|---|---|
| kube-prometheus-stack (Prometheus+Grafana+Alertmanager) bereits deployt | `k3d/monitoring/` (base), `prod/monitoring/` (overlay), `prod-fleet/*/kustomization.yaml` → `../../prod/monitoring` |
| **Kein** OTel-Collector, **kein** Tempo/Jaeger vorhanden | grep `opentelemetry\|otel-collector\|otlp` in `k3d/ prod/ prod-fleet/` → nur diese Spec |
| `pipeline.js` ist ein **Workflow-Script**; `execFileSync` ist **unzuverlässig** (durchweg try/catch + Fallback), `await fetch()` läuft **ungeschützt** (Z.202), `require('./*.cjs')` läuft ungeschützt (Z.17) | `scripts/factory/pipeline.js` |
| `dispatcher.js` kann **nicht** `execFileSync` → delegiert Bash an `agent()` | `scripts/factory/dispatcher.js:76` |
| Bestehender Hook pro Phase: `phaseEvent(ph,state,detail)` shellt zu `ticket.sh phase` (DB-Timeline) | `pipeline.js:60` |
| `wakeup.sh` sourct `~/.config/factory/autopilot.env` mit `set -a` (klobbert Env), pure-bash Tick-Loop | `scripts/factory/wakeup.sh:32,88` |
| Native Claude-Code-Telemetrie via Env-Vars (Host läuft `claude -p`) | code.claude.com/docs/en/monitoring-usage |
| Website-Admin-Muster: `*.astro` (AdminLayout+isAdmin) + Svelte-Komponente + `lib/*.ts` + `api/*.ts` | `dev-status.astro`, `api/factory-metrics.ts` |
| Website-ns hat **default-deny egress** außer nach `workspace` | Memory `reference_website_egress_default_deny` |

## 3. Architektur (3 Schichten + Backend)

```
                          WSL-Host (systemd)                         fleet-Cluster
 ┌─────────────────────────────────────────────┐        ┌──────────────────────────────────┐
 │ wakeup.sh (bash)                             │ OTLP   │ monitoring-ns                    │
 │  └ claude -p ───────────────┐                │ /HTTP  │  ┌────────────────────────────┐  │
 │     [Layer 1: native OTEL_*]│ token/cost/    │ :4318  │  │ otel-collector (NEU)       │  │
 │                             │ commit/PR/LOC  ├───────▶│  │  receiver: otlp http+grpc  │  │
 │  dispatcher.js / pipeline.js│                │ (auth) │  │  proc: memlimit+batch+attr │  │
 │   └ phaseEvent() ───────────┤ Factory-Spans  │        │  │  exporter: prometheus      │──┼─┐
 │   [Layer 2: otel-emit.cjs]  │ phase/tick/    │        │  └────────────────────────────┘  │ │ scrape
 │  wakeup.sh [otel-emit.sh] ──┘ feature/canary │        │  ┌────────────────────────────┐  │ │
 └─────────────────────────────────────────────┘        │  │ Prometheus (vorhanden)     │◀─┼─┘
                                                         │  └──────────────┬─────────────┘  │
 ┌─────────────────────────────────────────────┐        └─────────────────┼────────────────┘
 │ Website-Admin  [Layer 3: eigenes Dashboard]  │  PromQL /api/v1/query    │
 │  /admin/factory-observability                │◀─────────────────────────┘
 │   ├ Prometheus-Proxy (Token/Kosten/Dauer)    │  + Ticket-Phasen-Timeline (Postgres, vorhanden)
 │   └ FactoryObservability.svelte (Charts)     │
 └─────────────────────────────────────────────┘
```

### 3a. Backend — OTel-Collector (on-prem)
- **Neu:** `k3d/monitoring/otel-collector.yaml` — Deployment + Service + ConfigMap (Collector-Pipeline).
  - Receiver: `otlp` (http :4318, grpc :4317).
  - Processors: `memory_limiter`, `batch`, `resource` (setzt `service.namespace=factory`).
  - Exporter: `prometheus` (Collector exponiert `/metrics`, von Prometheus gescraped via **ServiceMonitor** `k3d/monitoring/servicemonitor-otel-collector.yaml`). Traces (enhanced-beta) → zunächst `debug`/`nop`-Exporter (Tempo nicht deployt; Traces optional, §8 Stretch).
- **In Kustomization einhängen:** `k3d/monitoring/kustomization.yaml` (`resources:` +Collector +ServiceMonitor). Fließt automatisch über `prod/monitoring` → `prod-fleet/*` in beide Brands.
- **Host-Erreichbarkeit:** Autopilot läuft **außerhalb** des Clusters. Collector wird über
  **Traefik-IngressRoute** `otel.<domain>` (Hostname zentral in `k3d/configmap-domains.yaml`,
  **kein** Brand-Literal im Code/Manifest — S3) mit **Bearer-Token-Auth** exponiert
  (Traefik-ForwardAuth-Middleware ODER Collector-`bearertokenauth`-Extension; Token aus
  SealedSecret). TLS via vorhandenem cert-manager-Wildcard.

### 3b. Layer 1 — Native Claude-Code-Telemetrie (größter Hebel, ~0 Code)
In `autopilot.env` (+ committetes Template `scripts/factory/autopilot.env.example`):
```bash
export CLAUDE_CODE_ENABLE_TELEMETRY=1
export OTEL_METRICS_EXPORTER=otlp
export OTEL_LOGS_EXPORTER=otlp
export OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf
export OTEL_EXPORTER_OTLP_ENDPOINT="https://otel.<domain>"   # via env-resolve, kein Literal
export OTEL_EXPORTER_OTLP_HEADERS="Authorization=Bearer ${FACTORY_OTLP_TOKEN}"
export OTEL_METRIC_EXPORT_INTERVAL=10000   # KRITISCH: default 60000 → kurzer Tick flusht nie
export OTEL_LOGS_EXPORT_INTERVAL=5000
export OTEL_RESOURCE_ATTRIBUTES="service.name=software-factory-autopilot,brand=${BRAND},git.sha=${GIT_SHA}"
# optional (Traces, enhanced beta):
# export CLAUDE_CODE_ENHANCED_TELEMETRY_BETA=1
# export OTEL_TRACES_EXPORTER=otlp
```
**Liefert gratis:** `claude_code.token.usage`, `claude_code.cost.usage`, `claude_code.commit.count`,
`claude_code.lines_of_code.count`, `claude_code.pull_request.count`, `claude_code.code_edit_tool.decision`,
sowie (mit beta) Tool-Dauer-Spans `claude_code.tool.execution`.

### 3c. Layer 2 — Factory-Spans/-Metriken (die fehlende Semantik)
Native Telemetrie weiß nicht *welche Phase/welches Ticket*. Layer 2 ergänzt das:
- **Neu:** `scripts/factory/otel-emit.cjs` — pures, `require`-bares Modul; `fetch()`-basierter
  OTLP/HTTP-JSON-Emitter (`emitMetric`, `emitPhase`). **No-op**, wenn `OTEL_EXPORTER_OTLP_ENDPOINT`
  ungesetzt oder `OTEL_SDK_DISABLED=true`. Keine Import-Zyklen (S2). Unit-Test via `node:test`.
- **Neu:** `scripts/factory/otel-emit.sh` — curl-basierter Zwilling für `wakeup.sh` + Bash-Helper.
- **Emittierte Custom-Signale:**
  - `factory.phase.duration` (ms) + `factory.phase.transition` (counter) — Labels: `phase`,
    `state` (entered/done/blocked), `brand`. `ticket_id` als **Exemplar/Log-Attribut**, NICHT als
    Metric-Label (Kardinalität, S-Hygiene).
  - `factory.tick.count`, `factory.tick.duration`, `factory.tick.launches`, `factory.tick.escalations`.
  - `factory.feature.outcome` (counter, Label `result`=shipped/blocked/errored), `factory.deploy.canary` (Label `status`=green/red).
- **Wiring (minimal-invasiv, S1-schonend):**
  - `pipeline.js`: **eine** Zeile in `phaseEvent()` neben dem bestehenden `ticket.sh phase`-Call
    (`require('./otel-emit.cjs').emitPhase(...)`, fire-and-forget, try/catch).
  - `dispatcher.js`: Tick-Grenzen (Prep/Launch/Metrics) — Emission über **`agent()`-Bash**
    (`bash otel-emit.sh ...`), da dispatcher kein `execFileSync` kann.
  - `wakeup.sh`: Tick-Start/-Ende + Queue-Tiefe via `otel-emit.sh`.

### 3d. Layer 3 — Eigenes Dashboard (das „Grafana-Äquivalent")
Folgt exakt dem `dev-status`-Muster:
- **Neu:** `website/src/pages/admin/factory-observability.astro` (AdminLayout + `isAdmin`-Gate).
- **Neu:** `website/src/components/factory/FactoryObservability.svelte` (Charts/Tabellen).
- **Neu:** `website/src/lib/factory-observability.ts` (Datenfunktionen).
- **Neu:** `website/src/pages/api/factory-observability.ts` (API-Route, `isAdmin`-gated wie `factory-metrics.ts`).
- **Datenquellen fusioniert:**
  1. **Prometheus HTTP-API** (`/api/v1/query_range`) — server-seitiger Proxy in der API-Route
     (Token/Kosten-Trends, Phasen-Dauer-Breakdown, Commits/Tick, Modell-Verteilung).
     → **NetworkPolicy nötig:** Website-ns hat default-deny-egress außer `workspace`; Prometheus
     liegt in `monitoring`-ns. **Neu:** `k3d/website-allow-egress-monitoring.yaml` (allow-egress
     website-ns → monitoring-ns Prometheus :9090). (Memory `reference_website_egress_default_deny`.)
  2. **Ticket-Phasen-Timeline** aus Postgres — **bereits vorhanden** (phaseEvent→`ticket.sh phase`,
     gerendert von `/dev-status`). Wiederverwenden, keine neue Tabelle.

## 4. Nicht-Ziele
- Keine neue Time-Series-DB (Prometheus wird wiederverwendet).
- Keine neue Postgres-Telemetrie-Tabelle (Phasen-Timeline ist schon da).
- Kein Tempo/Jaeger-Deploy in dieser PR (Traces = optionaler Stretch, §8).
- Keine Migration der bestehenden Grafana-Dashboards (Grafana bleibt als Power-Tool unangetastet).
- Keine OTel-Instrumentierung außerhalb der Factory (kein Website-/Keycloak-Tracing).

## 5. Konfiguration & Secrets
- **Neue Env-Vars** (`OTEL_*`, `FACTORY_OTLP_TOKEN`, `OTEL_COLLECTOR_HOST`): in
  `environments/schema.yaml` registrieren **und** in den `envsubst`-Listen jeder Task, die das
  Collector-Manifest/Ingress baut (Checkliste: `docs/superpowers/references/envsubst-variable-management.md`).
- **Hostname** `otel.<domain>` zentral in `k3d/configmap-domains.yaml` (kein Literal in Code — S3).
- **Bearer-Token** als SealedSecret (`environments/.secrets/<env>.yaml` → `task env:seal`),
  ge-mirrort in `autopilot.env` (Host-Seite, gitignored).

## 6. Risiken & Gotchas
| Risiko | Mitigation |
|---|---|
| Kurzer `claude -p`-Tick flusht 60s-Metric-Intervall nie | `OTEL_METRIC_EXPORT_INTERVAL=10000` + graceful exit; in Spec/Plan prominent |
| `execFileSync` im Workflow-Sandbox unzuverlässig | JS-Emission **nur via `fetch()`** (otel-emit.cjs); Bash via curl; alles fire-and-forget try/catch |
| Website-ns egress default-deny blockt Prometheus-Query | explizite allow-egress NetworkPolicy website→monitoring |
| Hohe Label-Kardinalität (ticket_id pro Serie) | `ticket_id` als Exemplar/Log-Attribut, nicht als Metric-Label |
| Brand-Domain-Literal im Manifest/Code (S3-Gate) | Hostname über `configmap-domains.yaml` + `envsubst` |
| pipeline.js ist groß → S1-Ratchet | Wiring = **eine** Zeile in vorhandenem `phaseEvent()`; Emitter-Logik in separates `.cjs`-Modul (kein Netto-Wachstum in pipeline.js) |
| Offener OTLP-Ingress = Datenleck | Bearer-Token-Auth + TLS; Ingress nur OTLP-Pfade |
| Autopilot läuft headless — env muss vor `claude -p` gesetzt sein | in `autopilot.env` (von `wakeup.sh` mit `set -a` gesourct) |

## 7. Claude-Design-Prompt (Dashboard-Layout)
Als Planungs-Artefakt (Pattern `reference_claude_design_handoff`) — der User füttert diesen
Prompt in Claude Design und importiert die SVGs in `FactoryObservability.svelte`:

> **Design ein Admin-Observability-Dashboard „Factory Observability"** (dark theme, passend zum
> bestehenden `/dev-status`/Cockpit-Look: `bg-dark`, Tailwind, kompakte Karten). Sektionen:
> (1) **KPI-Leiste**: Token/Tag, Kosten/Tag (USD), Commits/Tag, PRs/Tag, Ø-Zyklus, aktive Slots —
> je als Karte mit Sparkline. (2) **Kosten- & Token-Trend**: gestapeltes Flächendiagramm über Zeit,
> nach Phase (Scout/Design/Plan/Implement/Verify/Deploy) eingefärbt. (3) **Phasen-Dauer-Breakdown**:
> horizontaler Balken Ø-Dauer je Phase + Blocked-Rate. (4) **Tick-Timeline**: Liste der letzten Ticks
> (Zeit, Brand, Launches, Escalations, Kosten, Canary-Status grün/rot). (5) **Pro-Feature-Tabelle**:
> Ticket, Brand, Phase-Fortschritt (Scout..Deploy als Stepper), Token, Kosten, Outcome-Badge.
> Liefere SVG-Komponenten mit `currentColor`, ohne Root-width/height, ohne hartkodierte Hex-Brandfarben.

## 8. Stretch (out-of-scope, separate Tickets)
- Distributed Traces: `CLAUDE_CODE_ENHANCED_TELEMETRY_BETA=1` + Tempo-Deploy + `TRACEPARENT`-Propagation,
  damit native Token/Tool-Spans unter den Factory-Phase-Spans nisten.
- Alertmanager-Regeln (Kosten-Spike pro Tick → Pushover, vorhandener Channel).
- Backfill historischer `.remember/`-Logs in Prometheus.

## 9. Akzeptanzkriterien
1. OTel-Collector läuft in `monitoring`-ns (beide Brands), von Prometheus gescraped (Target up).
2. `autopilot.env`-Template + Doku: native Telemetrie aktivierbar; ein realer (dry-run) Tick
   erzeugt `claude_code.token.usage`/`.cost.usage`/`.commit.count` in Prometheus.
3. `otel-emit.cjs` + `.sh` mit Unit-Test; ein Pipeline-Lauf erzeugt `factory.phase.*`-Serien.
4. `/admin/factory-observability` zeigt (isAdmin-gated) KPI-Leiste + Kosten/Token-Trend +
   Phasen-Breakdown + Tick-Timeline, gespeist aus Prometheus + Ticket-Phasen-DB.
5. Keine Brand-Literale im Code (S3); neue Manifeste in Kustomization referenziert (S4);
   neue Env-Vars in `schema.yaml` + envsubst-Listen (Validierung grün).
6. `task test:changed` + `task freshness:regenerate` + `task freshness:check` grün; bei
   Test-Änderungen `task test:inventory` aktualisiert & committet.
