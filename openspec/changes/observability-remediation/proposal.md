# Proposal: observability-remediation

## Why

Die Observability-Architektur auf dem `fleet`-Cluster weist aktuell 4 kritische Schwachstellen auf:
1. **Logging-Pipeline:** Promtail ordnet pino numerische Log-Levels (`30`/`40`/`50`) nicht in sprechende Texte (`info`/`warn`/`error`) um (`detected_level="unknown"` in Loki). Promtail relabelt alle Namespace-Logs fälschlicherweise auf `brand="mentolder"`. `otel-emit.cjs` emittiert seit 25 Tagen mangels korrekter OTLP-Exporter-Endpoints keinen Traffic.
2. **Service Health Goals:** Es existiert keine historische Persistenz von Service-Health-Ergebnissen und Schwellwerten (Soll/Ist) in PostgreSQL samt periodischem K8s CronJob und Visualisierung im Admin-UI.
3. **Agent-Tracing:** Subagenten-Läufe werden nicht strukturiert getract; zudem fehlt eine verbindliche Referenzdokumentation für Agent-Configurations.
4. **Alertmanager:** Secret `alertmanager-pushover` besitzt 0-Byte Keys, wodurch der Alertmanager-Operator AlertmanagerConfigs lautstark verwirft.

## What

- **Partial 1 (p1-logging):** Promtail Pipeline-Stages in `promtail-values.yaml` um Regex/Template-Mapping erweitern (`50`->`error`, `40`->`warn`, `30`->`info`) und Namespace-Relabeling korrigieren (`workspace-korczewski` -> `korczewski`). OTLP-Collector Emittierung in `otel-emit.cjs` härten.
- **Partial 2 (p2-health):** PostgreSQL-Schema `service_health_checks` & `service_health_goals` anlegen, `health-goals-check.sh` als CronJob verdrahten, Admin-UI Dashboard erweitern.
- **Partial 3 (p3-tracing):** Subagenten-Tracing via `codebase-memory-mcp` `ingest_traces` implementieren und `.claude/skills/references/agent-config-standard.md` dokumentieren.
- **Partial 4 (p4-alertmanager):** `reseed-alertmanager-secret.sh` bereitstellen & Template patchen.
- **Partial 5 (p5-tests):** BATS, Vitest, Playwright E2E & Verification-Task.

_Ticket: T002151_
